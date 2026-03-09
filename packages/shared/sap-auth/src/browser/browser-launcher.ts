/**
 * Browser launcher utilities
 * Handles Puppeteer browser setup, configuration, and lifecycle
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { existsSync } from 'fs';
import { killRemainingChromeProcesses } from './process-manager.js';

/**
 * Browser mode type
 */
export type BrowserMode = 'headless' | 'visible';

/**
 * Browser launch result
 */
export interface BrowserLaunchResult {
  browser: Browser;
  page: Page;
  mode: BrowserMode;
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
 * Common Chrome launch arguments
 */
function getCommonChromeArgs(): string[] {
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
 * Get platform-specific browser flags
 */
function getPlatformFlags(): string[] {
  switch (process.platform) {
    case 'darwin':
      return MAC_FLAGS;
    case 'win32':
      return WINDOWS_FLAGS;
    default:
      return LINUX_FLAGS;
  }
}

/**
 * Resolve browser executable path
 */
export function resolveBrowserPath(): string | undefined {
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
 * Build Puppeteer launch options
 */
function buildLaunchOptions(headless: boolean, inPrivate: boolean): any {
  const platformFlags = getPlatformFlags();

  return {
    headless: headless ? 'new' : false,
    devtools: false,
    executablePath: resolveBrowserPath(),
    args: [
      ...getCommonChromeArgs(),
      ...platformFlags,
      ...(headless
        ? ['--disable-dev-shm-usage', '--disable-gpu', '--disable-popup-blocking']
        : []),
      ...(inPrivate
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
}

/**
 * Launch a Puppeteer browser instance
 */
export async function launchBrowser(
  headless: boolean,
  inPrivate: boolean,
  forceVisible: boolean,
): Promise<BrowserLaunchResult> {
  // Check for force visible mode - skip headless entirely
  if (headless && forceVisible) {
    console.log('SAP_AUTH_FORCE_VISIBLE or SAP_AUTH_SKIP_HEADLESS is set - skipping headless mode');
    headless = false;
  }

  const desiredMode: BrowserMode = headless ? 'headless' : 'visible';

  // Pre-launch cleanup: kill any lingering Puppeteer Chrome instances
  await killRemainingChromeProcesses();

  const launchOptions = buildLaunchOptions(headless, inPrivate);

  console.log(`Launching ${desiredMode} browser...`);
  const browser = await puppeteer.launch(launchOptions);

  // Use the first (default) page instead of creating a new one
  const pages = await browser.pages();
  let page: Page;
  if (pages.length > 0) {
    page = pages[0];
    console.log('Using default browser page (avoiding duplicate windows)');
  } else {
    page = await browser.newPage();
    console.log('Created new browser page');
  }

  console.log(`${desiredMode} browser launched successfully`);

  return { browser, page, mode: desiredMode };
}

/**
 * Configure default page settings
 */
export async function configurePageDefaults(
  page: Page,
  userAgent: string,
  inPrivate: boolean,
): Promise<void> {
  // If in private mode, clear all cached data
  if (inPrivate) {
    console.log('Private mode: Clearing all browser data and starting fresh...');
    await page.evaluateOnNewDocument(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }

  // Set dynamic user agent
  await page.setUserAgent(userAgent);

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });
}
