/**
 * Auth-specific MCP helper utilities
 *
 * These helpers allow MCPs to:
 * - Format auth errors in a consistent way
 * - Check if an error is auth-related
 * - Convert credentials to HTTP headers
 */

import { AuthError, AuthExpiredError, AuthNotConfiguredError, AuthBrowserError, ApiTokenRequiredError, Credentials } from './types.js';
import { ProviderRegistry } from './providers/index.js';
import { McpErrorResponse } from 'mcp-utils';

// ============================================================================
// Credential Helpers
// ============================================================================

/**
 * Convert credentials to HTTP headers
 *
 * @example
 * const headers = credentialsToHeaders(creds);
 * // { Cookie: "..." } or { Authorization: "Bearer ..." }
 */
export function credentialsToHeaders(creds: Credentials): Record<string, string> {
  if (creds.type === "cookie") {
    return { Cookie: creds.value };
  }
  // bearer or api-token
  return { Authorization: `Bearer ${creds.value}` };
}

// ============================================================================
// Auth Error Helpers
// ============================================================================

/**
 * Get resolution hint based on error type
 */
function getResolutionHint(error: AuthError): string {
  const providerId = error.providerId || 'unknown';
  const config = providerId !== 'unknown' ? ProviderRegistry.get(providerId) : null;
  const entryUrl = config?.entryUrl || '';

  if (error instanceof AuthBrowserError) {
    if (error.message.includes('timeout') || error.message.includes('certificate')) {
      return `Browser authentication failed. If you have multiple certificates, try setting VISIBLE_MODE=true environment variable for interactive authentication.`;
    }
    return `Browser authentication failed. Try authenticating again or set VISIBLE_MODE=true for interactive mode.`;
  }

  if (error instanceof AuthExpiredError) {
    return `Authentication has expired. The system will attempt to re-authenticate automatically on the next request.`;
  }

  if (error instanceof AuthNotConfiguredError) {
    if (entryUrl) {
      return `Authentication not configured. Please authenticate first by accessing: ${entryUrl}`;
    }
    return `Authentication not configured for provider: ${providerId}`;
  }

  if (error instanceof ApiTokenRequiredError) {
    return error.instructions || `API token required for ${providerId}. Please configure the appropriate environment variable.`;
  }

  return `Authentication failed. If this persists, try setting VISIBLE_MODE=true for interactive authentication.`;
}

/**
 * Format an auth error into a standard MCP error response
 *
 * @example
 * } catch (error) {
 *   if (isAuthError(error)) {
 *     return formatAuthError(error, 'wiki');
 *   }
 * }
 */
export function formatAuthError(error: unknown, providerId?: string): McpErrorResponse {
  if (error instanceof AuthError) {
    const resolvedProviderId = error.providerId || providerId || 'unknown';
    const config = resolvedProviderId !== 'unknown' ? ProviderRegistry.get(resolvedProviderId) : null;

    const errorResponse = {
      error: error.message,
      code: error.code,
      provider: resolvedProviderId,
      hint: getResolutionHint(error),
      ...(config?.entryUrl && { entryUrl: config.entryUrl }),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
      isError: true,
    };
  }

  // Handle legacy errors
  const resolvedProviderId = providerId || 'unknown';
  const config = resolvedProviderId !== 'unknown' ? ProviderRegistry.get(resolvedProviderId) : null;
  const entryUrl = config?.entryUrl || 'https://wiki.one.int.sap/';

  const errorResponse = {
    error: 'SAP_AUTH_REQUIRED',
    details: 'Need call SAP auth MCP to prepare cookie and redo function after.',
    data: { entry_url: entryUrl },
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
    isError: true,
  };
}

/**
 * Check if an error is an auth-related error
 *
 * Handles:
 * - AuthError and its subclasses
 * - Legacy errors with message "AUTHENTICATION_REQUIRED"
 * - Errors with name "AuthRedirectError"
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AuthError) {
    return true;
  }

  if (error instanceof Error) {
    if (error.message === 'AUTHENTICATION_REQUIRED') {
      return true;
    }
    if (error.name === 'AuthRedirectError') {
      return true;
    }
  }

  return false;
}
