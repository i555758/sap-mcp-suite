/**
 * Browser session management
 * Handles browser lifecycle, process cleanup, and state management
 */

import { Browser, Page } from 'puppeteer';
import { killProcessByPid } from './process-manager.js';
import {
  launchBrowser as doLaunchBrowser,
  configurePageDefaults,
  type BrowserMode,
} from './browser-launcher.js';
import { buildUserAgent } from '../utils/http.js';

/**
 * Browser session configuration
 */
export interface BrowserSessionConfig {
  userEmail?: string;
  inPrivate: boolean;
  visibleMode: boolean;
  forceVisible: boolean;
  forceManualFallback: boolean;
}

/**
 * Build session config from environment
 */
export function buildSessionConfig(): BrowserSessionConfig {
  return {
    userEmail: process.env.SAP_AUTH_ACCOUNT,
    inPrivate: process.env.IN_PRIVATE === 'true',
    visibleMode: process.env.VISIBLE_MODE === 'true',
    forceVisible:
      process.env.SAP_AUTH_FORCE_VISIBLE === 'true' ||
      process.env.SAP_AUTH_SKIP_HEADLESS === 'true',
    forceManualFallback: process.env.FORCE_MANUAL_FALLBACK === 'true',
  };
}

/**
 * Browser session state
 */
export interface BrowserSessionState {
  browser: Browser | null;
  page: Page | null;
  currentMode: BrowserMode | null;
  isInitialized: boolean;
}

/**
 * Create initial session state
 */
export function createSessionState(): BrowserSessionState {
  return {
    browser: null,
    page: null,
    currentMode: null,
    isInitialized: false,
  };
}

/**
 * Safe browser close method - prevents hanging Chrome instances
 */
export async function safeBrowserClose(state: BrowserSessionState): Promise<BrowserSessionState> {
  if (!state.browser) return state;

  let browserProcess: any = null;

  try {
    console.log('Safely closing existing browser instance...');
    browserProcess = state.browser.process();

    // First try to close all pages
    const pages = await state.browser.pages();
    for (const page of pages) {
      try {
        await page.close();
      } catch {
        // Ignore
      }
    }

    // Then close the browser
    await state.browser.close();
    console.log('Browser instance closed successfully');
  } catch (error) {
    console.warn('Warning: Error during safe browser close:', error);
  }

  // Always try to kill the process forcefully as a backup
  if (browserProcess && !browserProcess.killed) {
    const pid = browserProcess.pid;
    console.log(`Force killing browser process (PID: ${pid}) to ensure cleanup...`);
    await killProcessByPid(pid);
    console.log('Browser process terminated');
  }

  // Return reset state
  return {
    browser: null,
    page: null,
    currentMode: null,
    isInitialized: false,
  };
}

/**
 * Launch browser with proper mode handling
 */
export async function launchBrowserSession(
  state: BrowserSessionState,
  headless: boolean,
  config: BrowserSessionConfig,
): Promise<BrowserSessionState> {
  const userAgent = buildUserAgent();
  const desiredMode: BrowserMode = headless && !config.forceVisible ? 'headless' : 'visible';

  // Skip if browser is already running in the desired mode
  if (state.browser && state.currentMode === desiredMode) {
    console.log(`Browser already running in ${desiredMode} mode, reusing instance`);
    return state;
  }

  // Close existing browser if switching modes
  if (state.browser && state.currentMode !== desiredMode) {
    console.log(`Switching from ${state.currentMode} to ${desiredMode} mode`);
    state = await safeBrowserClose(state);
  }

  const result = await doLaunchBrowser(headless, config.inPrivate, config.forceVisible);

  // Configure page defaults
  await configurePageDefaults(result.page, userAgent, config.inPrivate);

  return {
    browser: result.browser,
    page: result.page,
    currentMode: result.mode,
    isInitialized: true,
  };
}

/**
 * Check if navigation error should trigger fallback to visible mode
 */
export function shouldFallbackToVisible(errorMessage: string): boolean {
  return (
    errorMessage.includes('timeout') ||
    errorMessage.includes('Timeout') ||
    errorMessage.includes('net::ERR_') ||
    errorMessage.includes('SSL') ||
    errorMessage.includes('certificate')
  );
}

/**
 * Navigate to URL with timeout handling
 */
export async function navigateWithTimeout(
  page: Page,
  url: string,
  timeout: number = 45000,
): Promise<void> {
  await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout,
  });
}
