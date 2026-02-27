/**
 * SSO automation utilities
 * Handles automated Microsoft SSO authentication flow
 */

import { Page } from 'puppeteer';
import { extractErrorMessage, delay } from 'mcp-utils';
import { isLoginUrl, checkForAuthenticatorNumber, handleAutomaticPrompts } from './auth-flows.js';

// ============================================================================
// Constants
// ============================================================================
const ELEMENT_SEARCH_TIMEOUT_MS = 10000;
const EMAIL_INPUT_TIMEOUT_MS = 15000;
const SUBMIT_CLICK_TIMEOUT_MS = 10000;
const POST_SUBMIT_DELAY_MS = 3000;
const POST_AUTH_DELAY_MS = 3000;
const REDIRECT_CONFIRMATION_DELAY_MS = 3000;
const ACCOUNT_SELECTION_TIMEOUT_MS = 5000;
const ACCOUNT_CLICK_DELAY_MS = 5000;
const PAGE_CONTENT_TIMEOUT_MS = 5000;

/**
 * Authentication attempt result
 */
export interface AuthAttemptResult {
  success: boolean;
  needsUserInteraction: boolean;
}

/**
 * Attempt headless authentication (email clicking, etc.)
 * Detects when user interaction is needed, including certificate selection dialogs
 */
export async function attemptHeadlessAuth(
  page: Page,
  domain: string,
  userEmail: string | undefined,
  forceManualFallback: boolean,
): Promise<AuthAttemptResult> {
  // Check if we should force manual fallback for testing
  if (forceManualFallback) {
    console.error('FORCE_MANUAL_FALLBACK enabled - skipping automation');
    return { success: false, needsUserInteraction: true };
  }

  try {
    // First, try to get the current URL with a timeout to detect cert selection hangs
    let currentUrl: string;
    try {
      currentUrl = page.url();
    } catch (urlError) {
      // If we can't even get the URL, something is blocking (possibly cert dialog)
      console.error('Cannot access page URL - possible certificate selection dialog');
      return { success: false, needsUserInteraction: true };
    }

    // Check if not on Microsoft login
    if (!currentUrl.includes('microsoftonline.com')) {
      const isOnTarget = currentUrl.includes(domain) && !isLoginUrl(currentUrl);
      if (isOnTarget) {
        return { success: true, needsUserInteraction: false };
      }
      console.error('Not on Microsoft SSO page');
      return { success: false, needsUserInteraction: true };
    }

    // Look for email input field with timeout
    let emailInput;
    try {
      emailInput = await Promise.race([
        page.$('input[type="email"]'),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Element search timeout')), ELEMENT_SEARCH_TIMEOUT_MS),
        ),
      ]);
    } catch (timeoutError) {
      console.error('Timeout searching for email input - possible certificate selection dialog');
      return { success: false, needsUserInteraction: true };
    }

    if (emailInput) {
      if (!userEmail) {
        console.error('No SAP_AUTH_ACCOUNT set, need visible browser for email input');
        return { success: false, needsUserInteraction: true };
      }

      console.error(`Filling email input with: ${userEmail}`);

      // Fill email with timeout protection
      try {
        await Promise.race([
          (async () => {
            await (emailInput as any).click();
            await (emailInput as any).evaluate((el: HTMLInputElement) => (el.value = ''));
            await (emailInput as any).type(userEmail);
          })(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Email input timeout')), EMAIL_INPUT_TIMEOUT_MS),
          ),
        ]);
      } catch (inputError) {
        console.error('Timeout during email input - possible certificate dialog blocking');
        return { success: false, needsUserInteraction: true };
      }

      // Click submit with timeout protection
      try {
        const submitButton =
          (await page.$('input[type="submit"]')) ||
          (await page.$('button[type="submit"]')) ||
          (await page.$('#idSIButton9'));

        if (submitButton) {
          console.error('Clicking submit button...');
          await Promise.race([
            submitButton.click(),
            new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Submit click timeout')), SUBMIT_CLICK_TIMEOUT_MS),
            ),
          ]);
          await delay(POST_SUBMIT_DELAY_MS);
        }
      } catch (submitError) {
        console.error('Timeout during submit - possible certificate dialog blocking');
        return { success: false, needsUserInteraction: true };
      }
    }

    // Look for account selection with timeout protection
    await tryAccountSelection(page, userEmail);

    // Check for MFA/authenticator number
    const authenticatorNumber = await checkForAuthenticatorNumber(page);
    if (authenticatorNumber) {
      console.error('Microsoft Authenticator Number Matching Required');
      console.error(`Enter this number in your Authenticator app: ${authenticatorNumber}`);
      return { success: false, needsUserInteraction: true };
    }

    // Handle automatic prompts
    await handleAutomaticPrompts(page);

    // Check if we reached target with timeout protection
    await delay(POST_AUTH_DELAY_MS);

    let newUrl: string;
    try {
      newUrl = page.url();
    } catch {
      console.error('Cannot access page URL after auth attempt - possible certificate dialog');
      return { success: false, needsUserInteraction: true };
    }

    const isOnTarget = newUrl.includes(domain) && !isLoginUrl(newUrl);

    if (isOnTarget) {
      // Wait to confirm (SSO sometimes has double redirects)
      await delay(REDIRECT_CONFIRMATION_DELAY_MS);
      const confirmedUrl = page.url();
      const stillOnTarget = confirmedUrl.includes(domain) && !isLoginUrl(confirmedUrl);

      if (stillOnTarget) {
        console.error('SSO completed successfully');
        return { success: true, needsUserInteraction: false };
      }
    }

    // Still on login page - check for MFA or other requirements
    const needsInteraction = await checkNeedsUserInteraction(page);

    if (needsInteraction) {
      console.error('Additional authentication steps required');
      return { success: false, needsUserInteraction: true };
    }

    return { success: false, needsUserInteraction: true };
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    console.error(`Headless auth failed: ${errorMessage}`);

    // Check for common certificate-related error patterns
    const certRelatedPatterns = [
      'timeout',
      'navigation',
      'net::ERR_',
      'SSL',
      'certificate',
      'TLS',
      'handshake',
      'connection refused',
      'ERR_CERT_',
      'ERR_SSL_',
    ];

    const isCertRelated = certRelatedPatterns.some((pattern) =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase()),
    );

    if (isCertRelated) {
      console.error('Error may be related to certificate selection or SSL handshake');
    }

    return { success: false, needsUserInteraction: true };
  }
}

/**
 * Try to select an account from the account picker
 */
async function tryAccountSelection(page: Page, userEmail: string | undefined): Promise<void> {
  const accountSelectors = [
    '.table-row',
    '[data-test-id*="@"]',
    'div[title*="@"]',
    'button[data-test-id*="@"]',
  ];

  for (const selector of accountSelectors) {
    try {
      const elements = await Promise.race([
        page.$$(selector),
        new Promise<any[]>((resolve) => setTimeout(() => resolve([]), ACCOUNT_SELECTION_TIMEOUT_MS)),
      ]);
      for (const element of elements) {
        const text = await element.evaluate((el: Element) => el.textContent || '');
        const targetEmail = userEmail || '@sap.com';
        if (text.includes(targetEmail) || text.includes('@')) {
          console.error(`Clicking account: ${text.substring(0, 40)}...`);
          await element.click();
          await delay(ACCOUNT_CLICK_DELAY_MS);
          break;
        }
      }
    } catch {
      // Continue
    }
  }
}

/**
 * Check if page content indicates user interaction is needed
 */
async function checkNeedsUserInteraction(page: Page): Promise<boolean> {
  let pageContent: string;
  try {
    pageContent = await Promise.race([
      page.evaluate(() => document.body.textContent || ''),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), PAGE_CONTENT_TIMEOUT_MS)),
    ]);
  } catch {
    pageContent = '';
  }

  // Check for indicators that need user interaction
  return (
    pageContent.includes('code') ||
    pageContent.includes('verify') ||
    pageContent.includes('certificate') ||
    pageContent.includes('Authenticator') ||
    pageContent.includes('password') ||
    pageContent.includes('smartcard') ||
    pageContent.includes('smart card') ||
    pageContent.includes('select a certificate') ||
    pageContent.includes('Choose a certificate') ||
    pageContent.length < 500 // Very short content often indicates a dialog/prompt
  );
}
