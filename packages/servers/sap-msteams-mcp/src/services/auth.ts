/**
 * Authentication module for SAP MS Teams MCP
 *
 * This module uses the shared sap-auth package for authentication.
 * It wraps the AuthManager to provide a Teams-specific interface.
 */

import { AuthManager, AuthError, AuthExpiredError } from "sap-auth";
import { createLogger } from "../logger.js";

const log = createLogger("teams-auth");

// Re-export error types for consumers
export { AuthError, AuthExpiredError } from "sap-auth";

// Token audiences
const TEAMS_CHAT_AUDIENCE = "https://ic3.teams.office.com";
const GRAPH_API_AUDIENCE = "https://graph.microsoft.com";

// ============================================================================
// Authentication Manager Class
// ============================================================================

export class TeamsAuthManager {
  private authManager: AuthManager;
  private region: string;

  constructor(
    _cookieStorePath?: string, // Kept for backward compatibility, no longer used
    region: string = "emea",
  ) {
    this.authManager = AuthManager.getInstance();
    this.region = region;
  }

  /**
   * Get the API base URL for the configured region
   */
  getApiBase(): string {
    return `https://teams.cloud.microsoft/api/chatsvc/${this.region}/v1/users/ME`;
  }

  /**
   * Get the configured region
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Get Teams Chat API token
   * The Chat API requires the ic3.teams.office.com audience token
   */
  async getToken(): Promise<string> {
    const creds = await this.authManager.getCredentialsForAudience(
      "teams",
      TEAMS_CHAT_AUDIENCE,
    );

    if (!creds) {
      throw new AuthExpiredError("teams");
    }

    if (creds.expiresAt) {
      const remaining = Math.round(
        (creds.expiresAt.getTime() - Date.now()) / 60000,
      );
      log.info(`Using Teams token (${remaining}m remaining)`);
    }

    return creds.value;
  }

  /**
   * Get Graph API token (optional - returns null if unavailable)
   */
  async getGraphToken(): Promise<string | null> {
    const creds = await this.authManager.getCredentialsForAudience(
      "teams",
      GRAPH_API_AUDIENCE,
    );

    if (!creds) {
      return null;
    }

    if (creds.expiresAt) {
      const remaining = Math.round(
        (creds.expiresAt.getTime() - Date.now()) / 60000,
      );
      log.info(`Using Graph token (${remaining}m remaining)`);
    }

    return creds.value;
  }

  /**
   * Check if Graph API token is available
   */
  async hasGraphToken(): Promise<boolean> {
    return (await this.getGraphToken()) !== null;
  }

  /**
   * Invalidate cached tokens (forces re-read on next request)
   * With the shared auth package, this triggers a status check
   */
  invalidateToken(): void {
    // The shared auth package handles caching internally
    // This is a no-op but kept for API compatibility
    log.debug("Token invalidation requested (handled by shared auth)");
  }
}

export default TeamsAuthManager;
