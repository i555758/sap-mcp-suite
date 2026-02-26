/**
 * SAP Auth - Shared authentication package for SAP MCP servers
 *
 * Usage:
 *   import { AuthManager, getAuth } from '@anthropic/sap-auth';
 *
 *   // Get credentials for a provider
 *   const auth = AuthManager.getInstance();
 *   const creds = await auth.getCredentials('wiki');
 *
 *   // Or use the convenience function
 *   const creds = await getAuth().getCredentials('wiki');
 *
 *   // Use in HTTP requests
 *   if (creds.type === 'cookie') {
 *     headers['Cookie'] = creds.value;
 *   } else if (creds.type === 'bearer') {
 *     headers['Authorization'] = `Bearer ${creds.value}`;
 *   }
 */

// Main entry point
export { AuthManager, getAuth } from './auth-manager.js';

// Types
export type {
  AuthMethodType,
  CredentialType,
  Credentials,
  ProviderConfig,
  StoredCookie,
  StoredToken,
  StoredRefreshToken,
  StoredAuth,
  StoredSapSsoAuth,
  StoredOAuthAuth,
  StoredApiTokenAuth,
  AuthStorage,
  AuthStatus,
} from './types.js';

// Errors
export {
  AuthError,
  AuthNotConfiguredError,
  AuthExpiredError,
  AuthBrowserError,
  ApiTokenRequiredError,
} from './types.js';

// Storage (for advanced use)
export { Storage } from './storage.js';

// Provider registry (for custom providers)
export {
  ProviderRegistry,
  WIKI_PROVIDER,
  JIRA_PROVIDER,
  TEAMS_PROVIDER,
  GRAPH_PROVIDER,
} from './providers/index.js';

// Auth methods (for advanced customization)
export { AuthMethod } from './methods/base.js';
export { SapSsoMethod } from './methods/sap-sso.js';
export { OAuthMethod } from './methods/oauth.js';
export { ApiTokenMethod } from './methods/api-token.js';

// Browser authenticator (for advanced use)
export { BrowserAuthenticator } from './browser/index.js';

// MCP helpers (for consistent error handling)
export { formatAuthError, isAuthError } from './mcp-helpers.js';
export type { McpErrorResponse } from './mcp-helpers.js';
