/**
 * Unified hybrid browser flow
 *
 * Single source of truth for the headless → SSO automation → visible fallback
 * pattern used by both authentication and browser-based requests.
 *
 * Callers provide an `onAuthenticated` callback that runs once the browser
 * has reached an authenticated state on the target domain.
 */

import type { Page } from 'puppeteer';
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
  isLoginUrl,
  waitForAuthenticationCompletion,
  showAuthAlert,
} from './auth-flows.js';
import { attemptHeadlessAuth } from './sso-automation.js';

// ============================================================================
// Constants
// ============================================================================
const MAX_RETRIES = 3;
const NAV_SETTLE_MS = 3000;
const RETRY_DELAY_MS = 1000;
const NAV_TIMEOUT_MS = 45000;
const VISIBLE_NAV_TIMEOUT_MS = 60000;
const FALLBACK_NAV_TIMEOUT_MS = 30000;
const NETWORK_IDLE_TIMEOUT_MS = 10000;

// Module-level flag to avoid registering duplicate cleanup handlers.
let cleanupHandlersRegistered = false;

// ============================================================================
// Public API
// ============================================================================

export interface HybridFlowOptions<T> {
  /** URL to navigate to initially (triggers SSO redirects). */
  entryUrl: string;

  /** Domain used for "are we authenticated?" checks. */
  domain: string;

  /**
   * Custom predicate: given the current URL, are we authenticated?
   * Defaults to: `url.includes(domain) && !isLoginUrl(url)`
   */
  isAuthenticated?: (url: string) => boolean;

  /** Pass `true` when authenticating against Teams (affects `waitForAuthenticationCompletion`). */
  isTeams?: boolean;

  /**
   * Called once the browser is on an authenticated page.
   * The browser is closed **after** this callback returns.
   */
  onAuthenticated: (page: Page) => Promise<T>;
}

/**
 * Run the hybrid browser flow:
 *
 * 1. Launch headless browser
 * 2. Navigate to `entryUrl`
 * 3. If already authenticated → call `onAuthenticated(page)`
 * 4. Otherwise → try SSO automation (up to 3 retries)
 * 5. If SSO fails → switch to visible browser, wait for user
 * 6. Call `onAuthenticated(page)`, close browser, return result
 */
export async function runHybridBrowserFlow<T>(options: HybridFlowOptions<T>): Promise<T> {
  const { entryUrl, domain, isTeams = false, onAuthenticated } = options;
  const config = buildSessionConfig();
  let state: BrowserSessionState = createSessionState();

  const isAuth = options.isAuthenticated ?? ((url: string) => url.includes(domain) && !isLoginUrl(url));

  try {
    // ── Force-visible path ──────────────────────────────────────────────
    if (config.forceVisible || config.visibleMode) {
      state = await launchSession(state, false, config);
      const page = requirePage(state, domain);

      await navigateWithTimeout(page, entryUrl, VISIBLE_NAV_TIMEOUT_MS);
      await delay(NAV_SETTLE_MS);

      if (!isAuth(page.url())) {
        await runSsoWithFallback(page, state, config, entryUrl, domain, isTeams, isAuth);
      }

      const result = await runCallback(page, onAuthenticated);
      state = await safeBrowserClose(state);
      return result;
    }

    // ── Headless path ───────────────────────────────────────────────────
    state = await launchSession(state, true, config);
    let page = requirePage(state, domain);

    const navigated = await navigateQuietly(page, entryUrl);
    if (!navigated) {
      // Navigation error (timeout, SSL, etc.) → go straight to visible.
      state = await switchToVisible(state, config, entryUrl, domain, isTeams, isAuth);
      page = requirePage(state, domain);
      const result = await runCallback(page, onAuthenticated);
      state = await safeBrowserClose(state);
      return result;
    }

    // Already authenticated?
    if (isAuth(page.url())) {
      console.error('Already authenticated');
      const result = await runCallback(page, onAuthenticated);
      state = await safeBrowserClose(state);
      return result;
    }

    // ── SSO automation with retries ─────────────────────────────────────
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      console.error(`SSO attempt ${attempt}/${MAX_RETRIES}`);

      const ssoResult = await attemptHeadlessAuth(
        page,
        domain,
        config.userEmail,
        config.forceManualFallback,
      );

      if (ssoResult.success) {
        console.error('SSO automation succeeded');
        const result = await runCallback(page, onAuthenticated);
        state = await safeBrowserClose(state);
        return result;
      }

      if (ssoResult.needsUserInteraction) {
        console.error('User interaction required, switching to visible browser...');
        state = await switchToVisible(state, config, entryUrl, domain, isTeams, isAuth);
        page = requirePage(state, domain);
        const result = await runCallback(page, onAuthenticated);
        state = await safeBrowserClose(state);
        return result;
      }

      if (attempt < MAX_RETRIES) {
        console.error(`Retrying SSO (attempt ${attempt + 1}/${MAX_RETRIES})...`);
        await delay(RETRY_DELAY_MS);
      }
    }

    // All retries exhausted → visible fallback.
    console.error('SSO retries exhausted, falling back to visible browser');
    state = await switchToVisible(state, config, entryUrl, domain, isTeams, isAuth);
    page = requirePage(state, domain);
    const result = await runCallback(page, onAuthenticated);
    state = await safeBrowserClose(state);
    return result;
  } catch (error) {
    state = await safeBrowserClose(state);
    if (error instanceof AuthBrowserError) throw error;
    throw new AuthBrowserError(domain, extractErrorMessage(error));
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Launch a browser session with process-cleanup handlers.
 */
async function launchSession(
  state: BrowserSessionState,
  headless: boolean,
  config: BrowserSessionConfig,
): Promise<BrowserSessionState> {
  state = await launchBrowserSession(state, headless, config);
  registerCleanupHandlers(state);
  return state;
}

/**
 * Require that the session has a page, or throw.
 */
function requirePage(state: BrowserSessionState, domain: string): Page {
  if (!state.page) throw new AuthBrowserError(domain, 'Failed to create browser page');
  return state.page;
}

/**
 * Navigate and swallow fallback-worthy errors (timeout, SSL, cert).
 * Returns `true` if navigation succeeded, `false` if it failed and we should
 * fall back to visible mode.
 */
async function navigateQuietly(page: Page, url: string): Promise<boolean> {
  try {
    console.error(`Navigating to ${url}...`);
    await navigateWithTimeout(page, url, NAV_TIMEOUT_MS);
    await delay(NAV_SETTLE_MS);
    console.error(`Current URL: ${page.url().substring(0, 80)}...`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Navigation issue: ${msg}`);
    if (shouldFallbackToVisible(msg)) {
      console.error('Navigation blocked — will switch to visible browser');
      return false;
    }
    throw err;
  }
}

/**
 * Switch from headless to visible mode:
 * save cookies → relaunch visible → restore cookies → navigate → alert → wait.
 */
async function switchToVisible(
  state: BrowserSessionState,
  config: BrowserSessionConfig,
  entryUrl: string,
  domain: string,
  isTeams: boolean,
  isAuth: (url: string) => boolean,
): Promise<BrowserSessionState> {
  const savedUrl = state.page?.url() || '';
  const savedCookies = state.page ? await state.page.cookies() : [];

  state = await launchSession(state, false, config);
  const page = requirePage(state, domain);

  if (savedCookies.length > 0) {
    await page.setCookie(...savedCookies);
    console.error(`Restored ${savedCookies.length} cookies to visible browser`);
  }

  const targetUrl = savedUrl && !savedUrl.startsWith('about:') ? savedUrl : entryUrl;
  await navigateWithTimeout(page, targetUrl, FALLBACK_NAV_TIMEOUT_MS);
  await delay(NAV_SETTLE_MS);

  // Already authenticated after restoring cookies?
  if (isAuth(page.url())) {
    return state;
  }

  // Try SSO automation in visible mode (it still clicks elements).
  const ssoResult = await attemptHeadlessAuth(page, domain, config.userEmail, config.forceManualFallback);
  if (ssoResult.success) {
    return state;
  }

  // Wait for user to complete authentication.
  console.error('Please complete authentication in the visible browser...');
  await showAuthAlert(page);

  const success = await waitForAuthenticationCompletion(page, domain, isTeams);
  if (!success) {
    throw new AuthBrowserError(domain, 'Authentication timeout after switching to visible mode');
  }

  return state;
}

/**
 * Run SSO with visible-mode fallback (used when already in visible mode).
 */
async function runSsoWithFallback(
  page: Page,
  state: BrowserSessionState,
  config: BrowserSessionConfig,
  entryUrl: string,
  domain: string,
  isTeams: boolean,
  isAuth: (url: string) => boolean,
): Promise<void> {
  const ssoResult = await attemptHeadlessAuth(page, domain, config.userEmail, config.forceManualFallback);
  if (ssoResult.success) return;

  console.error('Please complete authentication in the visible browser...');
  await showAuthAlert(page);

  const success = await waitForAuthenticationCompletion(page, domain, isTeams);
  if (!success) {
    throw new AuthBrowserError(domain, 'Authentication timeout');
  }
}

/**
 * Wait for the page to stabilize after auth redirects, then call the callback.
 * This prevents "Failed to fetch" errors caused by calling page.evaluate()
 * while the page is still navigating after an auth redirect chain.
 */
async function runCallback<T>(page: Page, callback: (page: Page) => Promise<T>): Promise<T> {
  console.error('Waiting for page to stabilize...');
  await delay(NAV_SETTLE_MS);
  try {
    await page.waitForNetworkIdle({ timeout: NETWORK_IDLE_TIMEOUT_MS });
  } catch {
    console.error('Network idle timeout, continuing anyway...');
  }
  return callback(page);
}

/**
 * Register process cleanup handlers (once per process).
 */
function registerCleanupHandlers(state: BrowserSessionState): void {
  if (cleanupHandlersRegistered) return;

  const cleanup = async () => {
    console.error('Process cleanup: Closing browser...');
    await safeBrowserClose(state);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', () => {
    if (state.browser) {
      console.error('Process exit: Force closing browser...');
      state.browser.close().catch(() => {});
    }
  });

  cleanupHandlersRegistered = true;
}
