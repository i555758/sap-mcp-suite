/**
 * Browser-based authenticator using Puppeteer
 *
 * Thin wrapper around `runHybridBrowserFlow` that provides the appropriate
 * `onAuthenticated` callback for each auth type (SAP SSO vs OAuth).
 */

import type { StoredCookie, StoredToken, StoredRefreshToken } from '../types.js';

import { runHybridBrowserFlow } from './hybrid-flow.js';
import {
  isTeamsUrl,
  isLoginUrl,
  extractCookies,
  extractTeamsCookies,
} from './auth-flows.js';
import { extractTokens, extractMsalRefreshToken } from './token-extraction.js';

/**
 * Browser authenticator for SAP systems
 * Hybrid mode: starts headless, switches to visible if user interaction needed
 */
export class BrowserAuthenticator {
  /**
   * No-op — the hybrid flow manages its own browser lifecycle.
   * Kept for backward compatibility.
   */
  async close(): Promise<void> {}

  /**
   * Authenticate with SAP SSO and return cookies
   */
  async authenticateSapSso(entryUrl: string, domain: string): Promise<StoredCookie[]> {
    domain = this.resolveDomain(entryUrl, domain, 'wiki.one.int.sap');
    this.logAuthStart(domain, entryUrl);

    return runHybridBrowserFlow<StoredCookie[]>({
      entryUrl,
      domain,
      onAuthenticated: (page) => extractCookies(page, domain),
    });
  }

  /**
   * Authenticate with OAuth and extract tokens
   */
  async authenticateOAuth(
    entryUrl: string,
    domain: string,
    targetAudiences: string[],
  ): Promise<{
    cookies: StoredCookie[];
    tokens: StoredToken[];
    refreshToken?: StoredRefreshToken;
    account?: {
      homeAccountId: string;
      environment: string;
      tenantId: string;
      username: string;
      name?: string;
    };
  }> {
    const isTeams = isTeamsUrl(entryUrl);
    domain = this.resolveDomain(entryUrl, domain, 'teams.microsoft.com');
    this.logAuthStart(isTeams ? 'Microsoft Teams' : domain, entryUrl);

    return runHybridBrowserFlow({
      entryUrl,
      domain,
      isTeams,
      isAuthenticated: (url) =>
        isTeams
          ? isTeamsUrl(url) && !isLoginUrl(url)
          : url.includes(domain) && !isLoginUrl(url),
      onAuthenticated: async (page) => {
        const cookies = isTeams
          ? await extractTeamsCookies(page)
          : await extractCookies(page, domain);
        console.error(`Retrieved ${cookies.length} cookies`);

        const tokens = await extractTokens(page, targetAudiences);
        console.error(`Extracted ${tokens.length} token(s)`);

        const msalData = await extractMsalRefreshToken(page);
        if (msalData.refreshToken) {
          console.error(`Extracted refresh token for client ${msalData.refreshToken.clientId}`);
        }
        if (msalData.account) {
          console.error(`Extracted account info for ${msalData.account.username}`);
        }

        return {
          cookies,
          tokens,
          refreshToken: msalData.refreshToken,
          account: msalData.account,
        };
      },
    });
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private resolveDomain(entryUrl: string, domain: string, fallback: string): string {
    if (domain) return domain;
    try {
      return new URL(entryUrl).hostname;
    } catch {
      return fallback;
    }
  }

  private logAuthStart(target: string, entryUrl: string): void {
    console.error(`Authenticating with ${target}...`);
    console.error(`Entry URL: ${entryUrl}`);
  }
}
