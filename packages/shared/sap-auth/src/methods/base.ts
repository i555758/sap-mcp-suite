/**
 * Base class for authentication methods
 */

import type {
  Credentials,
  ProviderConfig,
  StoredAuth,
} from '../types.js';
import { Storage } from '../storage.js';

/**
 * Abstract base class for authentication methods
 * Each auth method (sap-sso, oauth, api-token) extends this
 */
export abstract class AuthMethod<T extends StoredAuth = StoredAuth> {
  protected storage: Storage;

  constructor() {
    this.storage = Storage.getInstance();
  }

  /**
   * Check if stored auth data is still valid
   */
  abstract validate(stored: T | null): Promise<boolean>;

  /**
   * Convert stored auth to credentials for HTTP requests
   */
  abstract toCredentials(stored: T): Credentials;

  /**
   * Attempt to refresh auth without user interaction
   * Returns new auth data if successful, null if refresh failed
   */
  abstract refresh(
    stored: T | null,
    config: ProviderConfig,
  ): Promise<T | null>;

  /**
   * Perform full authentication (may launch browser)
   * Called when refresh fails or no stored auth exists
   */
  abstract authenticate(config: ProviderConfig): Promise<T>;

  /**
   * Get credentials for a provider, refreshing if needed
   * This is the main entry point MCPs use
   */
  async getCredentials(config: ProviderConfig): Promise<Credentials> {
    const providerId = config.id;

    // Load stored auth
    let stored = await this.storage.get<T>(providerId);

    // Valid? Return immediately
    if (await this.validate(stored)) {
      return this.toCredentials(stored!);
    }

    // Try refresh
    const refreshed = await this.refresh(stored, config);
    if (refreshed && (await this.validate(refreshed))) {
      await this.storage.set(providerId, refreshed);
      return this.toCredentials(refreshed);
    }

    // Full re-auth
    const newAuth = await this.authenticate(config);
    await this.storage.set(providerId, newAuth);
    return this.toCredentials(newAuth);
  }

  /**
   * Get auth status without triggering refresh
   */
  async getStatus(providerId: string): Promise<{
    configured: boolean;
    valid: boolean;
    expiresAt: Date | null;
  }> {
    const stored = await this.storage.get<T>(providerId);

    if (!stored) {
      return { configured: false, valid: false, expiresAt: null };
    }

    const valid = await this.validate(stored);
    const expiresAt = this.getExpiresAt(stored);

    return { configured: true, valid, expiresAt };
  }

  /**
   * Get expiration date from stored auth
   * Override in subclasses for specific expiration logic
   */
  protected getExpiresAt(_stored: T): Date | null {
    return null;
  }
}
