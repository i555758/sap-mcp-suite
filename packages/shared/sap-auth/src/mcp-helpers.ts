/**
 * MCP Helper utilities for consistent error handling
 *
 * These helpers allow MCPs to format auth errors in a consistent way
 * without duplicating error message logic.
 */

import { AuthError, AuthExpiredError, AuthNotConfiguredError, AuthBrowserError, ApiTokenRequiredError } from './types.js';
import { ProviderRegistry } from './providers/index.js';

/**
 * Standard MCP error response format
 */
export interface McpErrorResponse {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

/**
 * Get resolution hint based on error type
 */
function getResolutionHint(error: AuthError): string {
  const providerId = error.providerId || 'unknown';
  const config = providerId !== 'unknown' ? ProviderRegistry.get(providerId) : null;
  const entryUrl = config?.entryUrl || '';

  if (error instanceof AuthBrowserError) {
    // Browser auth failed - likely cert selection or other interactive requirement
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

  // Generic auth error
  return `Authentication failed. If this persists, try setting VISIBLE_MODE=true for interactive authentication.`;
}

/**
 * Format an auth error into a standard MCP error response
 *
 * Use this in MCP catch blocks to return consistent error messages:
 *
 * ```typescript
 * } catch (error) {
 *   if (isAuthError(error)) {
 *     return formatAuthError(error, 'wiki');
 *   }
 *   // ... other error handling
 * }
 * ```
 *
 * @param error - The error to format (AuthError or legacy Error with "AUTHENTICATION_REQUIRED")
 * @param providerId - Provider ID (e.g., 'wiki', 'jira') - required for legacy errors
 */
export function formatAuthError(error: unknown, providerId?: string): McpErrorResponse {
  // Handle AuthError instances
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
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2),
        },
      ],
      isError: true,
    };
  }

  // Handle legacy errors (e.g., message === "AUTHENTICATION_REQUIRED")
  const resolvedProviderId = providerId || 'unknown';
  const config = resolvedProviderId !== 'unknown' ? ProviderRegistry.get(resolvedProviderId) : null;
  const entryUrl = config?.entryUrl || 'https://wiki.one.int.sap/';

  const errorResponse = {
    error: 'SAP_AUTH_REQUIRED',
    details: 'Need call SAP auth MCP to prepare cookie and redo function after.',
    data: {
      entry_url: entryUrl,
    },
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(errorResponse, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Check if an error is an auth-related error
 *
 * Useful for MCPs that catch generic errors and need to determine
 * if they should use formatAuthError()
 *
 * This handles:
 * - AuthError and its subclasses (AuthExpiredError, AuthNotConfiguredError, etc.)
 * - Legacy errors with message "AUTHENTICATION_REQUIRED"
 * - Errors with name "AuthRedirectError" (from HTTP interceptors)
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AuthError) {
    return true;
  }

  if (error instanceof Error) {
    // Legacy error format used by some MCPs
    if (error.message === 'AUTHENTICATION_REQUIRED') {
      return true;
    }
    // AuthRedirectError from HTTP interceptors
    if (error.name === 'AuthRedirectError') {
      return true;
    }
  }

  return false;
}
