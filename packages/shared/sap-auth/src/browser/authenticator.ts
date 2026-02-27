/**
 * Browser-based authenticator using Puppeteer
 * Handles SAP SSO and OAuth token extraction
 *
 * This is the main orchestrator that coordinates between:
 * - process-manager.ts: Chrome process lifecycle
 * - browser-launcher.ts: Puppeteer setup and configuration
 * - browser-session.ts: Browser session state management
 * - auth-flows.ts: Cookie and flow utilities
 * - sso-automation.ts: Automated SSO handling
 * - token-extraction.ts: OAuth token extraction
 */

import { Browser, Page } from 'puppeteer';
import type { StoredCookie, StoredToken, StoredRefreshToken } from '../types.js';
import { AuthBrowserError } from '../types.js';
import { extractErrorMessage, delay } from 'mcp-utils';

import {
  buildSessionConfig,
  createSessionState,
  safeBrowserClose,
  launchBrowserSession,
  shouldFallbackToVisible,
  navigateWithTimeout,
  type BrowserSessionConfig,
  type BrowserSessionState,
} from './browser-session.js';
import {
  isTeamsUrl,
  isLoginUrl,
  extractCookies,
  extractTeamsCookies,
  waitForAuthenticationCompletion,
  showAuthAlert,
} from './auth-flows.js';
import { attemptHeadlessAuth } from './sso-automation.js';
import { extractTokens, extractMsalRefreshToken } from './token-extraction.js';

// ============================================================================
// Constants
// ============================================================================
const MAX_RETRIES = 3;
const NAV_SETTLE_MS = 3000;
const RETRY_DELAY_MS = 1000;
const URL_TRUNCATION_LENGTH = 80;
const VISIBLE_NAV_TIMEOUT_MS = 60000;
const FALLBACK_NAV_TIMEOUT_MS = 30000;
const NETWORK_IDLE_TIMEOUT_MS = 10000;

/**
 * Browser authenticator for SAP systems
 * Hybrid mode: starts headless, switches to visible if user interaction needed
 */
export class BrowserAuthenticator {
  private state: BrowserSessionState = createSessionState();
  private readonly config: BrowserSessionConfig = buildSessionConfig();
  private cleanupHandlersSetup = false;

  private get browser(): Browser | null {
    return this.state.browser;
  }

  private get page(): Page | null {
    return this.state.page;
  }

  /**
   * Set up process cleanup handlers to prevent memory leaks
   */
  private setupProcessCleanup(): void {
    if (this.cleanupHandlersSetup) return;

    const cleanup = async () => {
      console.error('Process cleanup: Closing browser...');
      await this.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => {
      if (this.browser) {
        console.error('Process exit: Force closing browser...');
        this.browser.close().catch(() => {});
      }
    });
    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception, cleaning up browser:', error);
      await this.emergencyCleanup();
      process.exit(1);
    });
    process.on('unhandledRejection', async (reason) => {
      console.error('Unhandled rejection, cleaning up browser:', reason);
      await this.emergencyCleanup();
      process.exit(1);
    });

    this.cleanupHandlersSetup = true;
  }

  private async launchBrowser(headless: boolean): Promise<void> {
    this.state = await launchBrowserSession(this.state, headless, this.config);
    this.setupProcessCleanup();
  }

  private async safeBrowserClose(): Promise<void> {
    this.state = await safeBrowserClose(this.state);
  }

  private async emergencyCleanup(): Promise<void> {
    try {
      await this.safeBrowserClose();
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
    }
  }

  async close(): Promise<void> {
    await this.safeBrowserClose();
  }

  /**
   * Authenticate with SAP SSO and return cookies
   */
  async authenticateSapSso(entryUrl: string, domain: string): Promise<StoredCookie[]> {
    try {
      domain = this.resolveDomain(entryUrl, domain, 'wiki.one.int.sap');
      this.logAuthStart(domain, entryUrl);

      // Handle visible mode preferences
      if (this.config.forceVisible || this.config.visibleMode) {
        return await this.authenticateWithVisibleMode(entryUrl, domain);
      }

      // Start with headless mode
      console.error('Starting hybrid authentication (headless first)...');
      await this.launchBrowser(true);

      if (!this.page) {
        throw new AuthBrowserError(domain, 'Failed to create page');
      }

      // Navigate with fallback handling
      const navigated = await this.navigateWithFallback(entryUrl, domain);
      if (!navigated) {
        return await this.authenticateWithVisibleMode(entryUrl, domain);
      }

      // Check if already authenticated
      const currentUrl = this.page.url();
      if (currentUrl.includes(domain) && !isLoginUrl(currentUrl)) {
        console.error('Already authenticated');
        return await this.extractAndClose(domain);
      }

      // Handle SSO flow with retries
      return await this.runSsoFlow(entryUrl, domain);
    } catch (error) {
      await this.emergencyCleanup();
      throw this.wrapError(error, domain);
    }
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
    try {
      const isTeams = isTeamsUrl(entryUrl);
      domain = this.resolveDomain(entryUrl, domain, 'teams.microsoft.com');
      this.logAuthStart(isTeams ? 'Microsoft Teams' : domain, entryUrl);

      // Launch browser based on mode preferences
      await this.launchBrowser(!(this.config.forceVisible || this.config.visibleMode));

      if (!this.page) {
        throw new AuthBrowserError(domain, 'Failed to create page');
      }

      // Navigate with fallback handling
      const navigated = await this.navigateWithFallback(entryUrl, domain);
      if (!navigated && !(this.config.forceVisible || this.config.visibleMode)) {
        await this.launchBrowser(false);
        if (!this.page) {
          throw new AuthBrowserError(domain, 'Failed to create visible page after fallback');
        }
        await navigateWithTimeout(this.page, entryUrl, VISIBLE_NAV_TIMEOUT_MS);
      }

      // Check if already authenticated
      const currentUrl = this.page.url();
      const isAuthenticated = isTeams
        ? isTeamsUrl(currentUrl) && !isLoginUrl(currentUrl)
        : currentUrl.includes(domain) && !isLoginUrl(currentUrl);

      if (!isAuthenticated) {
        await this.runOAuthSsoFlow(entryUrl, domain, isTeams);
      } else {
        console.error('Already authenticated');
      }

      // Wait for page to stabilize
      await this.waitForStability();

      // Extract cookies
      const cookies = isTeams
        ? await extractTeamsCookies(this.page)
        : await extractCookies(this.page, domain);
      console.error(`Retrieved ${cookies.length} cookies`);

      // Extract tokens
      const tokens = await extractTokens(this.page, targetAudiences);
      console.error(`Extracted ${tokens.length} token(s)`);

      // Extract MSAL data
      const msalData = await extractMsalRefreshToken(this.page);
      if (msalData.refreshToken) {
        console.error(`Extracted refresh token for client ${msalData.refreshToken.clientId}`);
      }
      if (msalData.account) {
        console.error(`Extracted account info for ${msalData.account.username}`);
      }

      await this.safeBrowserClose();

      return {
        cookies,
        tokens,
        refreshToken: msalData.refreshToken,
        account: msalData.account,
      };
    } catch (error) {
      await this.emergencyCleanup();
      throw this.wrapError(error, domain);
    }
  }

  // ============================================================================
  // Private Helper Methods
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
    if (this.config.userEmail) {
      console.error(`SAP Auth Account: ${this.config.userEmail}`);
    }
  }

  private async navigateWithFallback(url: string, domain: string): Promise<boolean> {
    if (!this.page) return false;
    console.error(`Navigating to ${url}...`);
    try {
      await navigateWithTimeout(this.page, url);
      await delay(NAV_SETTLE_MS);
      console.error(`Current URL: ${this.page.url().substring(0, URL_TRUNCATION_LENGTH)}...`);
      return true;
    } catch (navError) {
      const navErrorMsg = navError instanceof Error ? navError.message : 'Unknown error';
      console.error(`Navigation issue: ${navErrorMsg}`);
      if (shouldFallbackToVisible(navErrorMsg)) {
        console.error('Navigation blocked - switching to visible browser...');
        await this.safeBrowserClose();
        return false;
      }
      throw navError;
    }
  }

  private async extractAndClose(domain: string): Promise<StoredCookie[]> {
    const cookies = await extractCookies(this.page!, domain);
    await this.safeBrowserClose();
    return cookies;
  }

  private async authenticateWithVisibleMode(
    entryUrl: string,
    domain: string,
  ): Promise<StoredCookie[]> {
    await this.launchBrowser(false);
    if (!this.page) {
      throw new AuthBrowserError(domain, 'Failed to create visible page');
    }

    console.error('Running automated authentication in visible browser...');
    await navigateWithTimeout(this.page, entryUrl, VISIBLE_NAV_TIMEOUT_MS);
    await delay(NAV_SETTLE_MS);

    // Check if already authenticated
    if (this.page.url().includes(domain) && !isLoginUrl(this.page.url())) {
      console.error('Already authenticated');
      return await this.extractAndClose(domain);
    }

    // Try automated flow
    const result = await attemptHeadlessAuth(
      this.page,
      domain,
      this.config.userEmail,
      this.config.forceManualFallback,
    );

    if (result.success) {
      return await this.extractAndClose(domain);
    }

    // Wait for user
    console.error('Please complete authentication in the visible browser...');
    const success = await waitForAuthenticationCompletion(this.page, domain);
    if (!success) {
      throw new AuthBrowserError(domain, 'Authentication timeout');
    }

    return await this.extractAndClose(domain);
  }

  private async runSsoFlow(entryUrl: string, domain: string): Promise<StoredCookie[]> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.error(`\nSSO Attempt ${attempt}/${MAX_RETRIES}`);

      const result = await attemptHeadlessAuth(
        this.page!,
        domain,
        this.config.userEmail,
        this.config.forceManualFallback,
      );

      if (result.success) {
        return await this.extractAndClose(domain);
      }

      if (result.needsUserInteraction) {
        return await this.switchToVisibleForCompletion(entryUrl, domain);
      }

      if (attempt < MAX_RETRIES) {
        console.error(`Retrying SSO (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await delay(RETRY_DELAY_MS);
      }
    }

    console.error('\nAll SSO attempts exhausted, falling back to visible browser');
    return await this.switchToVisibleForCompletion(entryUrl, domain);
  }

  private async runOAuthSsoFlow(
    entryUrl: string,
    domain: string,
    isTeams: boolean,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.error(`\nSSO Attempt ${attempt}/${MAX_RETRIES}`);

      const result = await attemptHeadlessAuth(
        this.page!,
        isTeams ? 'teams.microsoft.com' : domain,
        this.config.userEmail,
        this.config.forceManualFallback,
      );

      if (result.success) return;

      if (result.needsUserInteraction && !this.config.visibleMode) {
        await this.switchToVisibleForOAuth(entryUrl, domain, isTeams);
        return;
      }

      console.error('Please complete authentication in the visible browser...');
      const success = await waitForAuthenticationCompletion(this.page!, domain, isTeams);
      if (success) return;
    }

    throw new AuthBrowserError(domain, 'Authentication failed after all retries');
  }

  private async switchToVisibleForCompletion(
    entryUrl: string,
    domain: string,
  ): Promise<StoredCookie[]> {
    const currentUrl = this.page?.url() || '';
    const currentCookies = this.page ? await this.page.cookies() : [];

    await this.launchBrowser(false);
    if (!this.page) {
      throw new AuthBrowserError(domain, 'Failed to create visible page');
    }

    if (currentCookies.length > 0) {
      await this.page.setCookie(...currentCookies);
      console.error(`Restored ${currentCookies.length} cookies to visible browser`);
    }

    const targetUrl = currentUrl && !currentUrl.startsWith('about:') ? currentUrl : entryUrl;
    await navigateWithTimeout(this.page, targetUrl, targetUrl === entryUrl ? VISIBLE_NAV_TIMEOUT_MS : FALLBACK_NAV_TIMEOUT_MS);

    console.error('Visible browser ready for user interaction');
    await showAuthAlert(this.page);

    const success = await waitForAuthenticationCompletion(this.page, domain);
    if (!success) {
      throw new AuthBrowserError(domain, 'Authentication timeout after switching to visible mode');
    }

    return await this.extractAndClose(domain);
  }

  private async switchToVisibleForOAuth(
    entryUrl: string,
    domain: string,
    isTeams: boolean,
  ): Promise<void> {
    console.error('Switching to visible browser for user interaction...');

    const savedUrl = this.page?.url() || '';
    const savedCookies = this.page ? await this.page.cookies() : [];

    await this.launchBrowser(false);
    if (!this.page) {
      throw new AuthBrowserError(domain, 'Failed to create visible page');
    }

    if (savedCookies.length > 0) {
      await this.page.setCookie(...savedCookies);
    }

    await navigateWithTimeout(this.page, savedUrl || entryUrl, FALLBACK_NAV_TIMEOUT_MS);
    await showAuthAlert(this.page);
  }

  private async waitForStability(): Promise<void> {
    if (!this.page) return;
    console.error('Waiting for page to stabilize...');
    await delay(NAV_SETTLE_MS);
    try {
      await this.page.waitForNetworkIdle({ timeout: NETWORK_IDLE_TIMEOUT_MS });
    } catch {
      console.error('Network idle timeout, continuing anyway...');
    }
  }

  private wrapError(error: unknown, domain: string): AuthBrowserError {
    if (error instanceof AuthBrowserError) return error;
    return new AuthBrowserError(domain, extractErrorMessage(error));
  }
}
