/**
 * AuthManager - Main entry point for SAP auth
 *
 * Usage:
 *   import { AuthManager } from 'sap-auth';
 *
 *   const auth = AuthManager.getInstance();
 *   const creds = await auth.getCredentials('wiki');
 *   // Use creds.value as Cookie header or Bearer token
 */

import type {
  Credentials,
  AuthStatus,
  ProviderConfig,
  StoredAuth,
  StoredOAuthAuth,
} from './types.js';
import {
  AuthError,
  AuthNotConfiguredError,
  ApiTokenRequiredError,
} from './types.js';
import { Storage } from './storage.js';
import { ProviderRegistry } from './providers/index.js';
import { SapSsoMethod } from './methods/sap-sso.js';
import { OAuthMethod } from './methods/oauth.js';
import { ApiTokenMethod } from './methods/api-token.js';
import { extractErrorMessage } from 'mcp-utils';

/**
 * Main AuthManager singleton
 */
export class AuthManager {
  private static instance: AuthManager;
  private storage: Storage;
  private sapSsoMethod: SapSsoMethod;
  private oauthMethod: OAuthMethod;
  private apiTokenMethod: ApiTokenMethod;

  private constructor() {
    this.storage = Storage.getInstance();
    this.sapSsoMethod = new SapSsoMethod();
    this.oauthMethod = new OAuthMethod();
    this.apiTokenMethod = new ApiTokenMethod();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * Get credentials for a provider
   * This is the main method MCPs use
   *
   * @param providerId - The provider ID (e.g., 'wiki', 'jira', 'teams')
   * @returns Credentials object with type and value
   * @throws AuthError if authentication fails
   */
  async getCredentials(providerId: string): Promise<Credentials> {
    const config = ProviderRegistry.get(providerId);

    if (!config) {
      throw new AuthNotConfiguredError(
        providerId,
        `Unknown provider: ${providerId}. Available: ${ProviderRegistry.list().join(', ')}`,
      );
    }

    // Get the appropriate auth method
    const method = this.getMethodForConfig(config);

    try {
      return await method.getCredentials(config);
    } catch (error) {
      // Re-throw auth errors as-is
      if (error instanceof AuthError) {
        throw error;
      }
      // Wrap other errors
      throw new AuthError(
        `Failed to get credentials for ${providerId}: ${extractErrorMessage(error)}`,
        'AUTH_FAILED',
        providerId,
      );
    }
  }

  /**
   * Get credentials for a specific token audience (OAuth only)
   * Used when a provider has multiple token audiences (e.g., Teams vs Graph)
   *
   * @param providerId - The provider ID
   * @param audience - The token audience to get
   */
  async getCredentialsForAudience(
    providerId: string,
    audience: string,
  ): Promise<Credentials | null> {
    const config = ProviderRegistry.get(providerId);
    if (!config) {
      return null;
    }

    let stored = await this.storage.get<StoredOAuthAuth>(providerId);

    // No stored auth? Do full auth flow
    if (!stored || stored.method !== 'oauth') {
      await this.getCredentials(providerId);
      stored = await this.storage.get<StoredOAuthAuth>(providerId);
      if (!stored || stored.method !== 'oauth') {
        return null;
      }
    }

    // Check if we have a valid token for this specific audience
    let token = this.oauthMethod.getTokenForAudience(stored, audience);
    if (token) {
      return token;
    }

    // Token for this audience is expired, try silent refresh
    const refreshed = await this.oauthMethod.refresh(stored, config);
    if (refreshed) {
      await this.storage.set(providerId, refreshed);
      token = this.oauthMethod.getTokenForAudience(refreshed, audience);
      if (token) {
        return token;
      }
    }

    // Refresh failed or didn't get this audience, do full re-auth
    await this.forceReauth(providerId);
    stored = await this.storage.get<StoredOAuthAuth>(providerId);
    if (!stored || stored.method !== 'oauth') {
      return null;
    }
    return this.oauthMethod.getTokenForAudience(stored, audience);
  }

  /**
   * Get auth status for a provider without triggering authentication
   *
   * @param providerId - The provider ID
   */
  async getStatus(providerId: string): Promise<AuthStatus> {
    const config = ProviderRegistry.get(providerId);

    if (!config) {
      return {
        providerId,
        configured: false,
        valid: false,
        method: null,
        expiresAt: null,
        expiresInMinutes: null,
      };
    }

    const stored = await this.storage.get<StoredAuth>(providerId);

    if (!stored) {
      return {
        providerId,
        configured: false,
        valid: false,
        method: config.method,
        expiresAt: null,
        expiresInMinutes: null,
      };
    }

    const method = this.getMethodForConfig(config);
    const status = await method.getStatus(providerId);

    let expiresInMinutes: number | null = null;
    if (status.expiresAt) {
      const remaining = status.expiresAt.getTime() - Date.now();
      expiresInMinutes = Math.max(0, Math.round(remaining / 60000));
    }

    return {
      providerId,
      configured: status.configured,
      valid: status.valid,
      method: stored.method,
      expiresAt: status.expiresAt,
      expiresInMinutes,
    };
  }

  /**
   * Set an API token for a provider
   * Used when provider requires API token and user provides it
   *
   * @param providerId - The provider ID
   * @param token - The API token
   */
  async setApiToken(providerId: string, token: string): Promise<void> {
    await this.apiTokenMethod.setToken(providerId, token);
  }

  /**
   * Force re-authentication for a provider
   * Clears stored auth and triggers fresh authentication
   *
   * @param providerId - The provider ID
   */
  async forceReauth(providerId: string): Promise<Credentials> {
    await this.storage.delete(providerId);
    return await this.getCredentials(providerId);
  }

  /**
   * Clear auth for a specific provider
   *
   * @param providerId - The provider ID
   */
  async clearAuth(providerId: string): Promise<void> {
    await this.storage.delete(providerId);
  }

  /**
   * Clear all stored auth data
   */
  async clearAll(): Promise<void> {
    await this.storage.clearAll();
  }

  /**
   * List all configured providers with their status
   */
  async listProviders(): Promise<AuthStatus[]> {
    const providerIds = ProviderRegistry.list();
    const statuses: AuthStatus[] = [];

    for (const providerId of providerIds) {
      statuses.push(await this.getStatus(providerId));
    }

    return statuses;
  }

  /**
   * Register a custom provider
   *
   * @param config - The provider configuration
   */
  registerProvider(config: ProviderConfig): void {
    ProviderRegistry.register(config);
  }

  /**
   * Get the appropriate auth method for a provider config
   */
  private getMethodForConfig(config: ProviderConfig) {
    switch (config.method) {
      case 'sap-sso':
        return this.sapSsoMethod;
      case 'oauth':
        return this.oauthMethod;
      case 'api-token':
        return this.apiTokenMethod;
      default:
        throw new AuthError(
          `Unknown auth method: ${config.method}`,
          'UNKNOWN_METHOD',
          config.id,
        );
    }
  }

  /**
   * Get the storage file path (for debugging)
   */
  getStoragePath(): string {
    return this.storage.getAuthFilePath();
  }
}

// Convenience function for direct import
export function getAuth(): AuthManager {
  return AuthManager.getInstance();
}
