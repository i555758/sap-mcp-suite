/**
 * API Token authentication method (static tokens)
 * Used for services that support API tokens/PAT (Personal Access Tokens)
 */

import type {
  Credentials,
  ProviderConfig,
  StoredApiTokenAuth,
} from '../types.js';
import { ApiTokenRequiredError } from '../types.js';
import { AuthMethod } from './base.js';

/**
 * API Token authentication
 * Tokens are provided by the user and don't expire (or expire very far in future)
 */
export class ApiTokenMethod extends AuthMethod<StoredApiTokenAuth> {
  /**
   * Validate stored API token
   * Just checks if token exists - API tokens don't typically expire
   */
  async validate(stored: StoredApiTokenAuth | null): Promise<boolean> {
    if (!stored || stored.method !== 'api-token') {
      return false;
    }

    return !!stored.token && stored.token.length > 0;
  }

  /**
   * Convert API token to credentials
   */
  toCredentials(stored: StoredApiTokenAuth): Credentials {
    return {
      type: 'api-token',
      value: stored.token,
      expiresAt: null, // API tokens don't expire
    };
  }

  /**
   * API tokens can't be refreshed - they're static
   */
  async refresh(
    _stored: StoredApiTokenAuth | null,
    _config: ProviderConfig,
  ): Promise<StoredApiTokenAuth | null> {
    return null;
  }

  /**
   * "Authenticate" for API tokens means asking the user to provide one
   */
  async authenticate(config: ProviderConfig): Promise<StoredApiTokenAuth> {
    const instructions =
      config.setupInstructions ||
      `Please provide an API token for ${config.name}`;

    // Throw error with instructions - the MCP should catch this
    // and prompt the user for the token
    throw new ApiTokenRequiredError(config.id, instructions);
  }

  /**
   * API tokens don't expire
   */
  getExpiresAt(_stored: StoredApiTokenAuth): Date | null {
    return null;
  }
}
