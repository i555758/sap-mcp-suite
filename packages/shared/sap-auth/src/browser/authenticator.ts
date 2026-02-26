/**
 * Browser-based authenticator using Puppeteer
 * Handles SAP SSO and OAuth token extraction
 *
 * This is a port of the battle-tested browser-hybrid-auth.ts from sap-auth-mcp
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { existsSync } from 'fs';
import { join } from 'path';
import type { StoredCookie, StoredToken, StoredRefreshToken } from '../types.js';
import { AuthBrowserError } from '../types.js';
import { Storage } from '../storage.js';
import { parseJwt } from '../utils/jwt.js';

/**
 * Cross-platform User-Agent builder
 */
function buildUserAgent(): string {
  if (process.env.FORCE_UA) return process.env.FORCE_UA;
  switch (process.platform) {
    case 'win32':
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    case 'linux':
      return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    case 'darwin':
    default:
      return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
}

/**
 * Cross-platform sec-ch-ua-platform builder
 */
function buildSecChPlatform(): string {
  if (process.env.FORCE_PLATFORM_HEADER) return process.env.FORCE_PLATFORM_HEADER;
  switch (process.platform) {
    case 'win32':
      return '"Windows"';
    case 'linux':
      return '"Linux"';
    case 'darwin':
    default:
      return '"macOS"';
  }
}

/**
 * Resolve browser executable path
 */
function resolveBrowserPath(): string | undefined {
  const envPath = process.env.BROWSER_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  let resolved: string | undefined;
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    resolved = candidates.find((p) => existsSync(p));
  } else if (process.platform === 'darwin') {
    resolved = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    const candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
      '/opt/google/chrome/chrome',
    ];
    resolved = candidates.find((p) => existsSync(p));
  }

  return resolved && existsSync(resolved) ? resolved : undefined;
}

/**
 * Teams URL patterns
 */
const TEAMS_PATTERNS = [
  'teams.microsoft.com',
  'teams.cloud.microsoft',
  'teams.live.com',
  'teams.office.com',
];

function isTeamsUrl(url: string): boolean {
  return TEAMS_PATTERNS.some((pattern) => url.includes(pattern));
}

/**
 * Platform-specific browser flags
 */
const MAC_FLAGS = [
  '--use-mock-keychain=true',
  '--password-store=basic',
  '--disable-keychain-reauthorization',
  '--disable-mac-overlays',
];

const WINDOWS_FLAGS = ['--disable-gpu', '--window-size=1200,800'];

const LINUX_FLAGS = ['--disable-gpu', '--window-size=1200,800'];

/**
 * Browser authenticator for SAP systems
 * Hybrid mode: starts headless, switches to visible if user interaction needed
 */
export class BrowserAuthenticator {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly userAgent = buildUserAgent();
  private readonly secChPlatform = buildSecChPlatform();
  private readonly userEmail = process.env.SAP_AUTH_ACCOUNT;
  private readonly inPrivate = process.env.IN_PRIVATE === 'true';
  private readonly visibleMode = process.env.VISIBLE_MODE === 'true';
  private readonly forceManualFallback = process.env.FORCE_MANUAL_FALLBACK === 'true';

  // Browser instance management
  private isInitialized = false;
  private currentMode: 'headless' | 'visible' | null = null;
  private cleanupHandlersSetup = false;

  /**
   * Get common Chrome launch arguments
   */
  private getCommonChromeArgs(): string[] {
    return [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--no-first-run',
      '--disable-default-apps',
      '--use-system-certificate-store',
      '--auth-server-whitelist=*.sap.com,*.one.int.sap,*.wdf.sap.corp',
      '--auth-negotiate-delegate-whitelist=*.sap.com,*.one.int.sap,*.wdf.sap.corp',
      '--auth-schemes=basic,digest,ntlm,negotiate',
      '--window-size=1200,800',
    ];
  }

  /**
   * Set up process cleanup handlers to prevent memory leaks
   */
  private setupProcessCleanup(): void {
    if (this.cleanupHandlersSetup) return;

    const cleanup = async () => {
      console.log('🧹 Process cleanup: Closing browser...');
      await this.close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => {
      if (this.browser) {
        console.log('🧹 Process exit: Force closing browser...');
        this.browser.close().catch(() => {});
      }
    });
    process.on('uncaughtException', async (error) => {
      console.error('🚨 Uncaught exception, cleaning up browser:', error);
      await this.emergencyCleanup();
      process.exit(1);
    });
    process.on('unhandledRejection', async (reason) => {
      console.error('🚨 Unhandled rejection, cleaning up browser:', reason);
      await this.emergencyCleanup();
      process.exit(1);
    });

    this.cleanupHandlersSetup = true;
  }

  /**
   * Safe browser close method - prevents hanging Chrome instances
   */
  private async safeBrowserClose(): Promise<void> {
    if (!this.browser) return;

    let browserProcess: any = null;

    try {
      console.log('🔄 Safely closing existing browser instance...');
      browserProcess = this.browser.process();

      // First try to close all pages
      const pages = await this.browser.pages();
      for (const page of pages) {
        try {
          await page.close();
        } catch {
          // Ignore
        }
      }

      // Then close the browser
      await this.browser.close();
      console.log('✅ Browser instance closed successfully');
    } catch (error) {
      console.warn('⚠️ Warning: Error during safe browser close:', error);
    }

    // Always try to kill the process forcefully as a backup
    try {
      if (browserProcess && !browserProcess.killed) {
        console.log('🔪 Force killing browser process to ensure cleanup...');

        try {
          browserProcess.kill('SIGTERM');
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (!browserProcess.killed) {
            console.log('🔪 SIGTERM didn\'t work, trying SIGKILL...');
            browserProcess.kill('SIGKILL');
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch {
          // Ignore kill errors
        }

        if (browserProcess.killed) {
          console.log('✅ Browser process terminated successfully');
        } else {
          console.warn('⚠️ Warning: Browser process may still be running');
        }
      }
    } catch {
      // Ignore process errors
    }

    // Additional system-level cleanup
    try {
      await this.killRemainingChromeProcesses();
    } catch {
      // Ignore system cleanup errors
    }

    // Reset all references
    this.browser = null;
    this.page = null;
    this.currentMode = null;
    this.isInitialized = false;
  }

  /**
   * Kill any remaining Chrome processes that might be lingering
   */
  private async killRemainingChromeProcesses(): Promise<void> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(
        `ps aux | grep "Chrome.*--remote-debugging-port" | grep -v grep`,
      );

      if (stdout.trim()) {
        console.log('🔍 Found lingering Chrome processes, cleaning up...');

        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const match = line.match(/\s+(\d+)\s+/);
          if (match) {
            const pid = match[1];
            try {
              await execAsync(`kill -9 ${pid}`);
              console.log(`🔪 Killed lingering Chrome process ${pid}`);
            } catch {
              // Ignore kill errors
            }
          }
        }
      }
    } catch {
      // Silent fail - this is just a cleanup attempt
    }
  }

  /**
   * Emergency cleanup for critical errors
   */
  private async emergencyCleanup(): Promise<void> {
    try {
      await this.safeBrowserClose();
    } catch (error) {
      console.error('Emergency cleanup failed:', error);
    }
  }

  /**
   * Unified browser launch method - prevents multiple instances
   */
  private async launchBrowser(headless: boolean = true): Promise<void> {
    const desiredMode = headless ? 'headless' : 'visible';

    // Skip if browser is already running in the desired mode
    if (this.browser && this.currentMode === desiredMode) {
      console.log(`🔄 Browser already running in ${desiredMode} mode, reusing instance`);
      return;
    }

    // Close existing browser if switching modes
    if (this.browser && this.currentMode !== desiredMode) {
      console.log(`🔄 Switching from ${this.currentMode} to ${desiredMode} mode`);
      await this.safeBrowserClose();
    }

    // Pre-launch cleanup
    console.log('🧹 Pre-launch cleanup: checking for lingering Chrome processes...');
    await this.killRemainingChromeProcesses();

    try {
      const platformSpecificFlags =
        process.platform === 'darwin'
          ? MAC_FLAGS
          : process.platform === 'win32'
            ? WINDOWS_FLAGS
            : LINUX_FLAGS;

      const launchOptions: any = {
        headless: headless ? 'new' : false,
        devtools: !headless,
        executablePath: resolveBrowserPath(),
        args: [
          ...this.getCommonChromeArgs(),
          ...platformSpecificFlags,
          ...(headless
            ? [
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-popup-blocking',
              ]
            : []),
          ...(this.inPrivate
            ? [
                '--incognito',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-client-side-phishing-detection',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--disable-ipc-flooding-protection',
              ]
            : []),
        ],
      };

      console.log(`🚀 Launching ${desiredMode} browser...`);
      this.browser = await puppeteer.launch(launchOptions);
      this.currentMode = desiredMode;

      // Set up process cleanup handlers
      this.setupProcessCleanup();

      // Use the first (default) page instead of creating a new one
      const pages = await this.browser.pages();
      if (pages.length > 0) {
        this.page = pages[0];
        console.log('🪟 Using default browser page (avoiding duplicate windows)');
      } else {
        this.page = await this.browser.newPage();
        console.log('🪟 Created new browser page');
      }

      // Configure page
      await this.configurePageDefaults();
      this.isInitialized = true;

      console.log(`✅ ${desiredMode} browser launched successfully`);
    } catch (error) {
      console.error(`❌ Failed to launch ${desiredMode} browser:`, error);
      await this.emergencyCleanup();
      throw error;
    }
  }

  /**
   * Configure default page settings
   */
  private async configurePageDefaults(): Promise<void> {
    if (!this.page) return;

    // If in private mode, clear all cached data
    if (this.inPrivate) {
      console.log('🕵️ Private mode: Clearing all browser data and starting fresh...');
      await this.page.evaluateOnNewDocument(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    }

    // Set dynamic user agent
    await this.page.setUserAgent(this.userAgent);

    // Set viewport
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    await this.safeBrowserClose();
  }

  /**
   * Authenticate with SAP SSO and return cookies
   * Uses hybrid mode: headless first, visible fallback if needed
   */
  async authenticateSapSso(
    entryUrl: string,
    domain: string,
  ): Promise<StoredCookie[]> {
    try {
      // Extract domain from URL if not provided
      if (!domain) {
        try {
          const url = new URL(entryUrl);
          domain = url.hostname;
        } catch {
          domain = 'wiki.one.int.sap';
        }
      }

      console.log(`🔄 Authenticating with ${domain}...`);
      console.log(`🎯 Entry URL: ${entryUrl}`);

      if (this.userEmail) {
        console.log(`🔐 SAP Auth Account: ${this.userEmail}`);
      }

      // Handle visible mode preference
      if (this.visibleMode) {
        console.log('👁️ Visible mode: Starting with visible browser');
        return await this.authenticateWithVisibleMode(entryUrl, domain);
      }

      // Start with headless mode
      console.log('🤖 Starting hybrid authentication (headless first)...');
      await this.launchBrowser(true);

      if (!this.page) {
        throw new AuthBrowserError(domain, 'Failed to create page');
      }

      // Navigate to entry URL
      console.log(`🌐 Navigating to ${entryUrl}...`);
      await this.page.goto(entryUrl, {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));
      let currentUrl = this.page.url();
      console.log(`📍 Current URL: ${currentUrl.substring(0, 80)}...`);

      // Check if already authenticated
      if (currentUrl.includes(domain) && !this.isLoginUrl(currentUrl)) {
        console.log('✅ Already authenticated');
        const cookies = await this.extractCookies(domain);
        await this.safeBrowserClose();
        return cookies;
      }

      // Handle SSO flow
      const MAX_SSO_RETRIES = 3;
      for (let attempt = 1; attempt <= MAX_SSO_RETRIES; attempt++) {
        console.log(`\n📋 SSO Attempt ${attempt}/${MAX_SSO_RETRIES}`);

        const result = await this.attemptHeadlessAuth(domain);

        if (result.success) {
          const cookies = await this.extractCookies(domain);
          await this.safeBrowserClose();
          return cookies;
        }

        if (result.needsUserInteraction) {
          console.log('🔄 Switching to visible browser for user interaction...');
          return await this.switchToVisibleForCompletion(entryUrl, domain);
        }

        // If we reached here, retry
        if (attempt < MAX_SSO_RETRIES) {
          console.log(`⚠️ Retrying SSO (attempt ${attempt + 1}/${MAX_SSO_RETRIES})...`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // All retries exhausted, fallback to visible mode
      console.log(`\n📋 All SSO attempts exhausted, falling back to visible browser`);
      return await this.switchToVisibleForCompletion(entryUrl, domain);
    } catch (error) {
      await this.emergencyCleanup();
      if (error instanceof AuthBrowserError) {
        throw error;
      }
      throw new AuthBrowserError(
        domain,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Authenticate with visible mode from start
   */
  private async authenticateWithVisibleMode(
    entryUrl: string,
    domain: string,
  ): Promise<StoredCookie[]> {
    await this.launchBrowser(false);

    if (!this.page) {
      throw new AuthBrowserError(domain, 'Failed to create visible page');
    }

    // Try automation in visible mode
    console.log('🤖 Running automated authentication in visible browser...');
    await this.page.goto(entryUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Check if already authenticated
    const currentUrl = this.page.url();
    if (currentUrl.includes(domain) && !this.isLoginUrl(currentUrl)) {
      console.log('✅ Already authenticated');
      const cookies = await this.extractCookies(domain);
      await this.safeBrowserClose();
      return cookies;
    }

    // Try automated flow
    const result = await this.attemptHeadlessAuth(domain);

    if (result.success) {
      const cookies = await this.extractCookies(domain);
      await this.safeBrowserClose();
      return cookies;
    }

    // Wait for user to complete authentication
    console.log('👤 Please complete authentication in the visible browser...');
    const success = await this.waitForAuthenticationCompletion(domain);

    if (!success) {
      throw new AuthBrowserError(domain, 'Authentication timeout');
    }

    const cookies = await this.extractCookies(domain);
    await this.safeBrowserClose();
    return cookies;
  }

  /**
   * Switch to visible mode for completion
   */
  private async switchToVisibleForCompletion(
    entryUrl: string,
    domain: string,
  ): Promise<StoredCookie[]> {
    // Save current state
    const currentUrl = this.page?.url() || '';
    const currentCookies = this.page ? await this.page.cookies() : [];

    // Switch to visible browser
    await this.launchBrowser(false);

    if (!this.page) {
      throw new AuthBrowserError(domain, 'Failed to create visible page');
    }

    // Restore cookies and state
    if (currentCookies.length > 0) {
      await this.page.setCookie(...currentCookies);
      console.log(`🍪 Restored ${currentCookies.length} cookies to visible browser`);
    }

    // Navigate to current state or entry URL
    if (currentUrl && !currentUrl.startsWith('about:')) {
      console.log('🌐 Restoring authentication state in visible browser...');
      await this.page.goto(currentUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
    } else {
      await this.page.goto(entryUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
    }

    console.log('✅ Visible browser ready for user interaction');
    console.log('👤 Please complete any remaining authentication steps...');

    // Wait for user to complete authentication
    const success = await this.waitForAuthenticationCompletion(domain);

    if (!success) {
      throw new AuthBrowserError(domain, 'Authentication timeout');
    }

    const cookies = await this.extractCookies(domain);
    await this.safeBrowserClose();
    return cookies;
  }

  /**
   * Attempt headless authentication (email clicking, etc.)
   */
  private async attemptHeadlessAuth(
    domain: string,
  ): Promise<{ success: boolean; needsUserInteraction: boolean }> {
    if (!this.page) return { success: false, needsUserInteraction: false };

    // Check if we should force manual fallback for testing
    if (this.forceManualFallback) {
      console.log('🔧 FORCE_MANUAL_FALLBACK enabled - skipping automation');
      return { success: false, needsUserInteraction: true };
    }

    try {
      const currentUrl = this.page.url();

      // Check if not on Microsoft login
      if (!currentUrl.includes('microsoftonline.com')) {
        const isOnTarget = currentUrl.includes(domain) && !this.isLoginUrl(currentUrl);
        if (isOnTarget) {
          return { success: true, needsUserInteraction: false };
        }
        console.log('❌ Not on Microsoft SSO page');
        return { success: false, needsUserInteraction: true };
      }

      // Look for email input field
      const emailInput = await this.page.$('input[type="email"]');
      if (emailInput) {
        if (!this.userEmail) {
          console.log('⚠️ No SAP_AUTH_ACCOUNT set, need visible browser for email input');
          return { success: false, needsUserInteraction: true };
        }

        console.log(`📧 Filling email input with: ${this.userEmail}`);

        // Fill email
        await emailInput.click();
        await emailInput.evaluate((el) => ((el as HTMLInputElement).value = ''));
        await emailInput.type(this.userEmail);

        // Click submit
        const submitButton =
          (await this.page.$('input[type="submit"]')) ||
          (await this.page.$('button[type="submit"]')) ||
          (await this.page.$('#idSIButton9'));

        if (submitButton) {
          console.log('🖱️ Clicking submit button...');
          await submitButton.click();
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }

      // Look for account selection
      const accountSelectors = [
        '.table-row',
        '[data-test-id*="@"]',
        'div[title*="@"]',
        'button[data-test-id*="@"]',
      ];

      for (const selector of accountSelectors) {
        try {
          const elements = await this.page.$$(selector);
          for (const element of elements) {
            const text = await element.evaluate((el) => el.textContent || '');
            const targetEmail = this.userEmail || '@sap.com';
            if (text.includes(targetEmail) || text.includes('@')) {
              console.log(`🖱️ Clicking account: ${text.substring(0, 40)}...`);
              await element.click();
              await new Promise((resolve) => setTimeout(resolve, 5000));
              break;
            }
          }
        } catch {
          // Continue
        }
      }

      // Check for MFA/authenticator number
      const authenticatorNumber = await this.checkForAuthenticatorNumber();
      if (authenticatorNumber) {
        console.log('🔐 Microsoft Authenticator Number Matching Required');
        console.log(`🔢 Enter this number in your Authenticator app: ${authenticatorNumber}`);
        return { success: false, needsUserInteraction: true };
      }

      // Handle automatic prompts
      await this.handleAutomaticPrompts();

      // Check if we reached target
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const newUrl = this.page.url();

      const isOnTarget = newUrl.includes(domain) && !this.isLoginUrl(newUrl);

      if (isOnTarget) {
        // Wait to confirm (SSO sometimes has double redirects)
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const confirmedUrl = this.page.url();
        const stillOnTarget = confirmedUrl.includes(domain) && !this.isLoginUrl(confirmedUrl);

        if (stillOnTarget) {
          console.log('✅ SSO completed successfully');
          return { success: true, needsUserInteraction: false };
        }
      }

      // Still on login page - check for MFA or other requirements
      const pageContent = await this.page.evaluate(() => document.body.textContent || '');
      const needsInteraction =
        pageContent.includes('code') ||
        pageContent.includes('verify') ||
        pageContent.includes('certificate') ||
        pageContent.includes('Authenticator') ||
        pageContent.includes('password') ||
        pageContent.length < 500;

      if (needsInteraction) {
        console.log('🔐 Additional authentication steps required');
        return { success: false, needsUserInteraction: true };
      }

      return { success: false, needsUserInteraction: true };
    } catch (error) {
      console.log(`❌ Headless auth failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { success: false, needsUserInteraction: true };
    }
  }

  /**
   * Check for Microsoft Authenticator number matching display
   */
  private async checkForAuthenticatorNumber(): Promise<string | null> {
    if (!this.page) return null;

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Look for the specific ID
      const numberElement = await this.page.$('#idRemoteNGC_DisplaySign');
      if (numberElement) {
        const numberText = await numberElement.evaluate((el) => el.textContent?.trim() || '');
        if (numberText && /^\d+$/.test(numberText)) {
          return numberText;
        }
      }

      // Also check for other common selectors
      const alternativeSelectors = [
        '.ms-TextField-field',
        '.ms-Label',
        '[data-testid*="number"]',
        '.number-display',
        '.auth-number',
      ];

      for (const selector of alternativeSelectors) {
        try {
          const elements = await this.page.$$(selector);
          for (const element of elements) {
            const text = await element.evaluate((el) => el.textContent?.trim() || '');
            if (text && /^\d{2,3}$/.test(text)) {
              return text;
            }
          }
        } catch {
          // Continue
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Handle automatic prompts
   */
  private async handleAutomaticPrompts(): Promise<void> {
    if (!this.page) return;

    const selectors = [
      '#idSIButton9', // Stay signed in - Yes
      'input[value="Yes"]',
      'input[value="Accept"]',
    ];

    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          console.log(`🖱️ Auto-clicking: ${selector}`);
          await element.click();
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return;
        }
      } catch {
        // Continue
      }
    }
  }

  /**
   * Wait for authentication to complete
   */
  private async waitForAuthenticationCompletion(
    domain: string,
    isTeams: boolean = false,
  ): Promise<boolean> {
    if (!this.page) return false;

    console.log('⏳ Waiting for authentication to complete...');
    const maxAttempts = 72; // 6 minutes (5-second intervals)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const currentUrl = this.page.url();

      const isOnTarget = isTeams
        ? isTeamsUrl(currentUrl) && !this.isLoginUrl(currentUrl)
        : currentUrl.includes(domain) && !this.isLoginUrl(currentUrl);

      if (isOnTarget) {
        // Confirm no redirect
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const confirmedUrl = this.page.url();
        const stillOnTarget = isTeams
          ? isTeamsUrl(confirmedUrl) && !this.isLoginUrl(confirmedUrl)
          : confirmedUrl.includes(domain) && !this.isLoginUrl(confirmedUrl);

        if (stillOnTarget) {
          console.log('✅ Authentication completed');
          return true;
        }
      }

      if (attempt % 6 === 0) {
        console.log(`⏳ Waiting for authentication... (${Math.round((attempt * 5) / 60)}m)`);
      }
    }

    console.log('⏰ Authentication timeout after 6 minutes');
    return false;
  }

  /**
   * Check if URL is a login page
   */
  private isLoginUrl(url: string): boolean {
    return (
      url.includes('login') ||
      url.includes('auth') ||
      url.includes('microsoftonline.com') ||
      url.includes('accounts.sap.com')
    );
  }

  /**
   * Extract cookies from browser
   */
  private async extractCookies(domain: string): Promise<StoredCookie[]> {
    if (!this.page) return [];

    const cookies = await this.page.cookies();

    return cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
    }));
  }

  /**
   * Authenticate with OAuth and extract tokens (e.g., Microsoft Teams)
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

      if (!domain) {
        try {
          const url = new URL(entryUrl);
          domain = url.hostname;
        } catch {
          domain = 'teams.microsoft.com';
        }
      }

      console.log(`🔄 Authenticating with ${isTeams ? 'Microsoft Teams' : domain}...`);
      console.log(`🎯 Entry URL: ${entryUrl}`);

      if (this.userEmail) {
        console.log(`🔐 SAP Auth Account: ${this.userEmail}`);
      }

      // Handle visible mode preference
      if (this.visibleMode) {
        console.log('👁️ Visible mode: Starting with visible browser');
        await this.launchBrowser(false);
      } else {
        // Start with headless mode
        console.log('🤖 Starting hybrid authentication (headless first)...');
        await this.launchBrowser(true);
      }

      if (!this.page) {
        throw new AuthBrowserError(domain, 'Failed to create page');
      }

      // Navigate to entry URL
      console.log(`🌐 Navigating to ${entryUrl}...`);
      await this.page.goto(entryUrl, {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));
      let currentUrl = this.page.url();
      console.log(`📍 Current URL: ${currentUrl.substring(0, 80)}...`);

      // Check if already authenticated
      const isAuthenticated = isTeams
        ? isTeamsUrl(currentUrl) && !this.isLoginUrl(currentUrl)
        : currentUrl.includes(domain) && !this.isLoginUrl(currentUrl);

      if (!isAuthenticated) {
        // Handle SSO flow
        const MAX_SSO_RETRIES = 3;
        let authSuccess = false;

        for (let attempt = 1; attempt <= MAX_SSO_RETRIES; attempt++) {
          console.log(`\n📋 SSO Attempt ${attempt}/${MAX_SSO_RETRIES}`);

          const result = await this.attemptHeadlessAuth(isTeams ? 'teams.microsoft.com' : domain);

          if (result.success) {
            authSuccess = true;
            break;
          }

          if (result.needsUserInteraction && !this.visibleMode) {
            console.log('🔄 Switching to visible browser for user interaction...');

            // Save current state
            const savedUrl = this.page?.url() || '';
            const savedCookies = this.page ? await this.page.cookies() : [];

            // Switch to visible browser
            await this.launchBrowser(false);

            if (!this.page) {
              throw new AuthBrowserError(domain, 'Failed to create visible page');
            }

            // Restore cookies
            if (savedCookies.length > 0) {
              await this.page.setCookie(...savedCookies);
            }

            // Navigate to saved URL or entry URL
            await this.page.goto(savedUrl || entryUrl, {
              waitUntil: 'networkidle2',
              timeout: 30000,
            });
          }

          console.log('👤 Please complete authentication in the visible browser...');
          authSuccess = await this.waitForAuthenticationCompletion(domain, isTeams);

          if (authSuccess) break;
        }

        if (!authSuccess) {
          throw new AuthBrowserError(domain, 'Authentication failed after all retries');
        }
      } else {
        console.log('✅ Already authenticated');
      }

      // Wait for page to stabilize
      console.log('⏳ Waiting for page to stabilize...');
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Try to wait for network idle
      try {
        await this.page.waitForNetworkIdle({ timeout: 10000 });
      } catch {
        console.log('⚠️ Network idle timeout, continuing anyway...');
      }

      // Get cookies from authenticated session
      let cookies: StoredCookie[] = [];
      if (isTeams) {
        // Teams stores auth in various domains
        const teamsDomains = [
          'https://teams.microsoft.com',
          'https://teams.cloud.microsoft',
          'https://teams.live.com',
          'https://teams.office.com',
          'https://login.microsoftonline.com',
          'https://login.live.com',
        ];

        for (const teamsDomain of teamsDomains) {
          try {
            const domainCookies = await this.page.cookies(teamsDomain);
            for (const c of domainCookies) {
              cookies.push({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                expires: c.expires,
                httpOnly: c.httpOnly,
                secure: c.secure,
                sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
              });
            }
          } catch {
            // Some domains may not have cookies
          }
        }

        // Also get current page cookies
        const pageCookies = await this.page.cookies();
        for (const c of pageCookies) {
          cookies.push({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
          });
        }

        // Remove duplicates by name+domain
        const seen = new Set<string>();
        cookies = cookies.filter((c) => {
          const key = `${c.name}:${c.domain}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else {
        cookies = await this.extractCookies(domain);
      }

      console.log(`🍪 Retrieved ${cookies.length} cookies`);

      // Extract tokens from localStorage
      const tokens = await this.extractTokens(targetAudiences);
      console.log(`🔑 Extracted ${tokens.length} token(s)`);

      // Extract MSAL refresh token and account info
      const msalData = await this.extractMsalRefreshToken();
      if (msalData.refreshToken) {
        console.log(`🔄 Extracted refresh token for client ${msalData.refreshToken.clientId}`);
      }
      if (msalData.account) {
        console.log(`👤 Extracted account info for ${msalData.account.username}`);
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
      if (error instanceof AuthBrowserError) {
        throw error;
      }
      throw new AuthBrowserError(
        domain,
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Extract OAuth tokens from localStorage
   */
  private async extractTokens(targetAudiences: string[]): Promise<StoredToken[]> {
    if (!this.page) return [];

    // Get all localStorage items
    const localStorageData = await this.page.evaluate(() => {
      const result: { key: string; value: string }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            result.push({ key, value });
          }
        }
      }
      return result;
    });

    const tokens: StoredToken[] = [];
    const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

    for (const item of localStorageData) {
      const matches = item.value.match(jwtPattern);
      if (matches) {
        for (const jwt of matches) {
          const tokenInfo = parseJwt(jwt);
          if (tokenInfo) {
            // Check if audience matches any target
            const isTargetAudience = targetAudiences.some(
              (aud) =>
                tokenInfo.audience.includes(aud) ||
                aud.includes(tokenInfo.audience),
            );

            if (isTargetAudience && tokenInfo.expiresAt > Date.now() / 1000) {
              tokens.push({
                token: jwt,
                audience: tokenInfo.audience,
                expiresAt: tokenInfo.expiresAt,
                scopes: tokenInfo.scopes || [],
              });
            }
          }
        }
      }
    }

    // Deduplicate by token prefix
    const uniqueTokens = new Map<string, StoredToken>();
    for (const token of tokens) {
      const key = token.token.substring(0, 50);
      const existing = uniqueTokens.get(key);
      if (!existing || token.expiresAt > existing.expiresAt) {
        uniqueTokens.set(key, token);
      }
    }

    return Array.from(uniqueTokens.values());
  }

  /**
   * Extract MSAL refresh token and account info from localStorage
   * MSAL stores refresh tokens in a specific format with keys like:
   * {homeAccountId}-{environment}-refreshtoken-{clientId}----
   */
  private async extractMsalRefreshToken(): Promise<{
    refreshToken?: StoredRefreshToken;
    account?: {
      homeAccountId: string;
      environment: string;
      tenantId: string;
      username: string;
      name?: string;
    };
  }> {
    if (!this.page) return {};

    try {
      const msalData = await this.page.evaluate(() => {
        const result: {
          refreshToken?: {
            secret: string;
            clientId: string;
            homeAccountId: string;
            environment: string;
            expiresOn?: number;
          };
          account?: {
            homeAccountId: string;
            environment: string;
            tenantId: string;
            username: string;
            name?: string;
          };
        } = {};

        // Find refresh token entries (key pattern: *-refreshtoken-*)
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.includes('-refreshtoken-')) {
            try {
              const value = localStorage.getItem(key);
              if (value) {
                const parsed = JSON.parse(value);
                if (parsed.credentialType === 'RefreshToken' && parsed.secret) {
                  result.refreshToken = {
                    secret: parsed.secret,
                    clientId: parsed.clientId,
                    homeAccountId: parsed.homeAccountId,
                    environment: parsed.environment,
                    expiresOn: parsed.expiresOn ? parseInt(parsed.expiresOn, 10) : undefined,
                  };
                  break; // Take the first refresh token found
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        // Find account info (key pattern: msal.account.keys or direct account entry)
        const accountKeysStr = localStorage.getItem('msal.account.keys');
        if (accountKeysStr) {
          try {
            const accountKeys = JSON.parse(accountKeysStr);
            if (Array.isArray(accountKeys) && accountKeys.length > 0) {
              const accountData = localStorage.getItem(accountKeys[0]);
              if (accountData) {
                const parsed = JSON.parse(accountData);
                result.account = {
                  homeAccountId: parsed.homeAccountId,
                  environment: parsed.environment,
                  tenantId: parsed.realm || parsed.tenantId,
                  username: parsed.username,
                  name: parsed.name,
                };
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }

        return result;
      });

      return msalData;
    } catch (error) {
      console.warn('⚠️ Failed to extract MSAL refresh token:', error);
      return {};
    }
  }

  /**
   * Clean up any lingering Chrome processes - can be called externally
   */
  async cleanupChromeProcesses(): Promise<void> {
    console.log('🧹 Manual cleanup: searching for lingering Chrome processes...');
    await this.killRemainingChromeProcesses();
    console.log('✅ Manual cleanup completed');
  }
}
