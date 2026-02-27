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
  type Credentials,
} from "sap-auth";
import { logger } from "../utils/logger.js";

// Re-export types and errors that consumers might need
export { AuthError, ApiTokenRequiredError };
export type { Credentials };

/**
 * AuthManager for Jira - thin wrapper around shared auth package
 */
export class AuthManager {
  private sharedAuth: SharedAuthManager;
  private apiToken: string | undefined;

  /**
   * Constructor
   * @param apiToken Optional API token (from JIRA_API_TOKEN env var)
   */
  constructor(apiToken?: string) {
    this.sharedAuth = SharedAuthManager.getInstance();
    this.apiToken = apiToken;
  }

  /**
   * Initialize the auth manager with API token if provided
   * Call this after construction to ensure token is set
   */
  async initialize(): Promise<void> {
    if (this.apiToken) {
      await this.sharedAuth.setApiToken("jira", this.apiToken);
      logger.info("[AuthManager] API token configured");
    }
  }

  /**
   * Get credentials from the shared auth manager
   */
  async getCredentials(): Promise<Credentials> {
    return this.sharedAuth.getCredentials("jira");
  }

  /**
   * Get the auth header for HTTP requests
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const creds = await this.getCredentials();

    if (creds.type === "cookie") {
      return { Cookie: creds.value };
    }
    // api-token or bearer
    return { Authorization: `Bearer ${creds.value}` };
  }

  /**
   * Get the authentication type
   * @returns 'api_token' or 'cookies'
   */
  getAuthType(): "api_token" | "cookies" {
    return this.apiToken ? "api_token" : "cookies";
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
