/**
 * AuthManager - Main entry point for SAP auth
 *
 * Single orchestrator pattern: AuthManager owns the full auth flow
 * (storage I/O, method dispatch, credential type enforcement).
 * Auth methods are stateless building blocks.
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
  CredentialType,
  AuthMethodType,
  AuthStatus,
  ProviderConfig,
  StoredAuth,
  StoredApiTokenAuth,
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
import type { AuthMethod } from './methods/base.js';
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

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get credentials for a provider.
   * This is the main method MCPs use.
   *
   * Flow:
   * 1. Load stored auth (once)
   * 2. If stored: validate → return, or refresh → return
   * 3. If no valid auth: check if default method would produce rejected type,
   *    then authenticate fresh
   *
   * Method resolution uses stored.method (not config.method) — if a PAT was
   * stored for an SSO provider, we use ApiTokenMethod, not SapSsoMethod.
   */
  async getCredentials(providerId: string): Promise<Credentials> {
    const config = this.requireConfig(providerId);
    const stored = await this.storage.get<StoredAuth>(providerId);

    // Try existing credentials (method from stored auth, not config)
    if (stored) {
      const method = this.methodFor(stored.method);

      if (await method.validate(stored)) {
        return this.checked(method.toCredentials(stored), config);
      }

      // Try refresh
      const refreshed = await method.refresh(stored, config);
      if (refreshed && (await method.validate(refreshed))) {
        await this.storage.set(providerId, refreshed);
        return this.checked(method.toCredentials(refreshed), config);
      }
    }

    // Fresh auth — but first check if default method would produce rejected type
    // (e.g., don't launch browser to get cookies for GitHub which only accepts PATs)
    this.guardDefaultMethod(config);

    const method = this.methodFor(config.method);
    try {
      const newAuth = await method.authenticate(config);
      await this.storage.set(providerId, newAuth);
      return this.checked(method.toCredentials(newAuth), config);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
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

    const method = this.methodFor(stored.method);
    const valid = await method.validate(stored);
    const expiresAt = method.getExpiresAt(stored);

    let expiresInMinutes: number | null = null;
    if (expiresAt) {
      const remaining = expiresAt.getTime() - Date.now();
      expiresInMinutes = Math.max(0, Math.round(remaining / 60000));
    }

    return {
      providerId,
      configured: true,
      valid,
      method: stored.method,
      expiresAt,
      expiresInMinutes,
    };
  }

  /**
   * Set an API token for a provider
   * Used when provider requires API token and user provides it
   */
  async setApiToken(providerId: string, token: string): Promise<void> {
    const auth: StoredApiTokenAuth = {
      method: 'api-token',
      token,
      updatedAt: new Date().toISOString(),
    };
    await this.storage.set(providerId, auth);
  }

  /**
   * Force re-authentication for a provider
   * Clears stored auth and triggers fresh authentication.
   *
   * For providers whose default method can't produce an accepted credential
   * type (e.g., GitHub: default is SSO → cookies, but only api-token/bearer
   * accepted), we throw immediately without deleting the stored PAT —
   * otherwise the PAT is lost with no way to auto-replace it.
   */
  async forceReauth(providerId: string): Promise<Credentials> {
    const config = this.requireConfig(providerId);
    const typeMap: Record<AuthMethodType, CredentialType> = {
      'sap-sso': 'cookie',
      'oauth': 'bearer',
      'api-token': 'api-token',
    };
    const defaultCredType = typeMap[config.method];
    if (
      defaultCredType &&
      config.acceptedCredentialTypes &&
      !config.acceptedCredentialTypes.includes(defaultCredType)
    ) {
      throw new ApiTokenRequiredError(
        providerId,
        config.setupInstructions ||
          `Please provide an API token for ${config.name}`,
      );
    }

    await this.storage.delete(providerId);
    return await this.getCredentials(providerId);
  }

  /**
   * Clear auth for a specific provider
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
   */
  registerProvider(config: ProviderConfig): void {
    ProviderRegistry.register(config);
  }

  /**
   * Get the storage file path (for debugging)
   */
  getStoragePath(): string {
    return this.storage.getAuthFilePath();
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Resolve method instance by auth type
   */
  private methodFor(type: AuthMethodType): AuthMethod {
    switch (type) {
      case 'sap-sso':
        return this.sapSsoMethod;
      case 'oauth':
        return this.oauthMethod;
      case 'api-token':
        return this.apiTokenMethod;
    }
  }

  /**
   * Return credentials if type is accepted by the provider, throw if not.
   * Single enforcement point for acceptedCredentialTypes.
   */
  private checked(creds: Credentials, config: ProviderConfig): Credentials {
    if (
      config.acceptedCredentialTypes &&
      !config.acceptedCredentialTypes.includes(creds.type)
    ) {
      const instructions =
        config.setupInstructions ||
        `Provider ${config.id} requires credentials of type: ${config.acceptedCredentialTypes.join(', ')}`;
      throw new ApiTokenRequiredError(config.id, instructions);
    }
    return creds;
  }

  /**
   * Throw early if the config's default auth method would produce a credential
   * type that's not accepted (e.g., don't launch a browser to get cookies
   * for GitHub which only accepts PATs).
   */
  private guardDefaultMethod(config: ProviderConfig): void {
    const typeMap: Record<AuthMethodType, CredentialType> = {
      'sap-sso': 'cookie',
      'oauth': 'bearer',
      'api-token': 'api-token',
    };
    const credType = typeMap[config.method];
    if (credType) {
      this.checked(
        { type: credType, value: '', expiresAt: null },
        config,
      );
    }
  }

  /**
   * Get provider config or throw
   */
  private requireConfig(providerId: string): ProviderConfig {
    const config = ProviderRegistry.get(providerId);
    if (!config) {
      throw new AuthNotConfiguredError(
        providerId,
        `Unknown provider: ${providerId}. Available: ${ProviderRegistry.list().join(', ')}`,
      );
    }
    return config;
  }
}

// Convenience function for direct import
export function getAuth(): AuthManager {
  return AuthManager.getInstance();
}
