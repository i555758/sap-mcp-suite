/**
 * Auth Manager - Thin wrapper around shared sap-auth package
 *
 * Provides backward-compatible interface for Jira authentication
 * while delegating all work to the shared auth infrastructure.
 */
import {
  AuthManager as SharedAuthManager,
  AuthError,
  ApiTokenRequiredError,
  credentialsToHeaders,
  type Credentials,
} from "sap-auth";
import { logger } from "../utils/logger.js";

// Re-export types and errors that consumers might need
export { AuthError, ApiTokenRequiredError };
export type { Credentials };

/**
 * AuthManager for Jira - thin wrapper around shared auth package.
 * Credentials are resolved lazily — if none exist, the shared
 * package throws a structured error with setup instructions.
 */
export class AuthManager {
  private sharedAuth: SharedAuthManager;
  private lastCredType: string = "cookie";

  constructor() {
    this.sharedAuth = SharedAuthManager.getInstance();
  }

  /**
   * Get credentials from the shared auth manager.
   * Errors propagate with setup instructions from the provider registry.
   */
  async getCredentials(): Promise<Credentials> {
    const creds = await this.sharedAuth.getCredentials("jira");
    this.lastCredType = creds.type;
    return creds;
  }

  /**
   * Get the auth header for HTTP requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const creds = await this.getCredentials();
    return credentialsToHeaders(creds);
  }

  /**
   * Get the authentication type from the last resolved credentials.
   * Defaults to "cookies" since that's the most common Jira auth method.
   */
  getAuthType(): "api_token" | "cookies" {
    return this.lastCredType === "api-token" ? "api_token" : "cookies";
  }

  /**
   * Get the directory where auth credentials are stored
   */
  getCookieDir(): string {
    return this.sharedAuth.getStoragePath();
  }

  /**
   * Clear cached credentials and force re-authentication
   */
  async clearAuth(): Promise<void> {
    await this.sharedAuth.clearAuth("jira");
    logger.info("[AuthManager] Auth cleared");
  }
}
