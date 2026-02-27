/**
 * Authentication flow utilities
 * Handles SAP SSO, OAuth flows, and cookie extraction
 */

import { Page } from 'puppeteer';
import type { StoredCookie } from '../types.js';
import { extractErrorMessage, delay } from 'mcp-utils';

// ============================================================================
// Constants
// ============================================================================
const MAX_AUTH_ATTEMPTS = 72; // 6 minutes at 5 second intervals
const POLL_INTERVAL_MS = 5000;
const PROGRESS_LOG_INTERVAL = 6;
const CONFIRMATION_DELAY_MS = 3000;
const AUTHENTICATOR_CHECK_DELAY_MS = 2000;
const PROMPT_CLICK_DELAY_MS = 2000;

/**
 * Teams URL patterns
 */
const TEAMS_PATTERNS = [
  'teams.microsoft.com',
  'teams.cloud.microsoft',
  'teams.live.com',
  'teams.office.com',
];

/**
 * Teams domains for cookie extraction
 */
export const TEAMS_COOKIE_DOMAINS = [
  'https://teams.microsoft.com',
  'https://teams.cloud.microsoft',
  'https://teams.live.com',
  'https://teams.office.com',
  'https://login.microsoftonline.com',
  'https://login.live.com',
];

/**
 * Check if URL is a Teams URL
 */
export function isTeamsUrl(url: string): boolean {
  return TEAMS_PATTERNS.some((pattern) => url.includes(pattern));
}

/**
 * Check if URL is a login page
 */
export function isLoginUrl(url: string): boolean {
  return (
    url.includes('login') ||
    url.includes('auth') ||
    url.includes('microsoftonline.com') ||
    url.includes('accounts.sap.com')
  );
}

/**
 * Authentication attempt result
 */
export interface AuthAttemptResult {
  success: boolean;
  needsUserInteraction: boolean;
}

/**
 * Extract cookies from browser page
 */
export async function extractCookies(page: Page, domain: string): Promise<StoredCookie[]> {
  const cookies = await page.cookies();

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
 * Extract cookies from multiple Teams domains
 */
export async function extractTeamsCookies(page: Page): Promise<StoredCookie[]> {
  const cookies: StoredCookie[] = [];

  for (const teamsDomain of TEAMS_COOKIE_DOMAINS) {
    try {
      const domainCookies = await page.cookies(teamsDomain);
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
  const pageCookies = await page.cookies();
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
  return cookies.filter((c) => {
    const key = `${c.name}:${c.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Check for Microsoft Authenticator number matching display
 */
export async function checkForAuthenticatorNumber(page: Page): Promise<string | null> {
  try {
    await delay(AUTHENTICATOR_CHECK_DELAY_MS);

    // Look for the specific ID
    const numberElement = await page.$('#idRemoteNGC_DisplaySign');
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
        const elements = await page.$$(selector);
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
 * Handle automatic prompts (Stay signed in, etc.)
 */
export async function handleAutomaticPrompts(page: Page): Promise<void> {
  const selectors = [
    '#idSIButton9', // Stay signed in - Yes
    'input[value="Yes"]',
    'input[value="Accept"]',
  ];

  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        console.error(`Auto-clicking: ${selector}`);
        await element.click();
        await delay(PROMPT_CLICK_DELAY_MS);
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
export async function waitForAuthenticationCompletion(
  page: Page,
  domain: string,
  isTeams: boolean = false,
): Promise<boolean> {
  console.error('Waiting for authentication to complete...');

  for (let attempt = 0; attempt < MAX_AUTH_ATTEMPTS; attempt++) {
    await delay(POLL_INTERVAL_MS);

    const currentUrl = page.url();

    const isOnTarget = isTeams
      ? isTeamsUrl(currentUrl) && !isLoginUrl(currentUrl)
      : currentUrl.includes(domain) && !isLoginUrl(currentUrl);

    if (isOnTarget) {
      // Confirm no redirect
      await delay(CONFIRMATION_DELAY_MS);
      const confirmedUrl = page.url();
      const stillOnTarget = isTeams
        ? isTeamsUrl(confirmedUrl) && !isLoginUrl(confirmedUrl)
        : confirmedUrl.includes(domain) && !isLoginUrl(confirmedUrl);

      if (stillOnTarget) {
        console.error('Authentication completed');
        return true;
      }
    }

    if (attempt % PROGRESS_LOG_INTERVAL === 0) {
      console.error(`Waiting for authentication... (${Math.round((attempt * POLL_INTERVAL_MS / 1000) / 60)}m)`);
    }
  }

  console.error('Authentication timeout after 6 minutes');
  return false;
}

/**
 * Show authentication alert to user
 */
export async function showAuthAlert(page: Page): Promise<void> {
  await page.evaluate(() => {
    alert(
      'Please authenticate to use the SAP MCP servers.\n\nComplete the login process in this browser window.',
    );
  });
}
