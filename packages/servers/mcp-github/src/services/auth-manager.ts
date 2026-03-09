/**
 * Auth Manager - Thin wrapper around shared sap-auth package
 *
 * Provides GitHub PAT management via centralized auth infrastructure.
 * Token resolution, error messages, and credential type filtering
 * are all handled by the shared package.
 */
import {
  AuthManager as SharedAuthManager,
  ProviderRegistry,
  AuthError,
  ApiTokenRequiredError,
  type Credentials,
} from "sap-auth";

export { AuthError, ApiTokenRequiredError };
export type { Credentials };

/**
 * GitHubAuthManager - manages GitHub PAT via shared sap-auth package.
 * Token is resolved lazily on first tool call, not at startup.
 */
export class GitHubAuthManager {
  private sharedAuth: SharedAuthManager;
  private providerId: string;

  constructor(apiUrl: string) {
    this.sharedAuth = SharedAuthManager.getInstance();
    this.providerId = ProviderRegistry.resolveByUrl(apiUrl) || "github";
  }

  /**
   * Get a valid token string for Authorization: Bearer headers.
   * The shared package handles credential type validation (rejects cookies
   * via acceptedCredentialTypes) and error messages (via setupInstructions).
   */
  async getToken(): Promise<string> {
    const creds = await this.sharedAuth.getCredentials(this.providerId);
    return creds.value;
  }

  /**
   * Get the provider ID for logging
   */
  getProviderId(): string {
    return this.providerId;
  }
}
