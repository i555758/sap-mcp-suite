/**
 * Browser-based HTTP request
 *
 * Makes authenticated requests via the hybrid browser flow. Used as the
 * fallback path when a URL doesn't match any known provider — the browser's
 * system credentials (Kerberos/keychain) and SSO automation handle
 * authentication automatically.
 *
 * Uses Puppeteer's page.goto() + response capture for GET requests (avoids
 * CSP restrictions that block in-page fetch()), and falls back to
 * page.evaluate(fetch()) for non-GET requests.
 */

import type { Page, HTTPResponse } from 'puppeteer';
import { join } from 'path';
import { homedir } from 'os';
import { runHybridBrowserFlow } from './hybrid-flow.js';

export interface BrowserRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface BrowserRequestResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Make an HTTP request via a browser.
 *
 * Navigates to the URL's origin (triggering SSO), then once authenticated,
 * navigates to the actual target URL and captures the response.
 */
export async function makeBrowserRequest(
  url: string,
  options: BrowserRequestOptions = {},
): Promise<BrowserRequestResponse> {
  const origin = new URL(url).origin;
  const domain = new URL(url).hostname;
  const method = (options.method || 'GET').toUpperCase();

  return runHybridBrowserFlow<BrowserRequestResponse>({
    entryUrl: origin,
    domain,
    userDataDir: join(homedir(), '.sap-auth', 'browser-profile'),
    onAuthenticated: (page) =>
      method === 'GET'
        ? executeViaNavigation(page, url)
        : executeViaFetch(page, url, options),
  });
}

/**
 * GET requests: navigate directly to the URL and capture the response.
 * This bypasses CSP restrictions entirely since it's a top-level navigation.
 */
async function executeViaNavigation(
  page: Page,
  url: string,
): Promise<BrowserRequestResponse> {
  console.error(`[browser-request] Navigating to ${url}...`);

  const response = await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (!response) {
    throw new Error(`No response received when navigating to ${url}`);
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(response.headers())) {
    headers[key] = value;
  }

  const body = await response.text();

  return {
    status: response.status(),
    statusText: response.statusText(),
    headers,
    body,
  };
}

/**
 * Non-GET requests: use fetch() inside the browser context.
 * Falls back to this for POST/PUT/PATCH/DELETE since page.goto() only does GET.
 */
async function executeViaFetch(
  page: Page,
  url: string,
  options: BrowserRequestOptions,
): Promise<BrowserRequestResponse> {
  console.error(`[browser-request] Fetching ${url} (${options.method})...`);

  const result = await page.evaluate(
    async (fetchUrl: string, fetchOpts: { method?: string; headers?: Record<string, string>; body?: string }) => {
      const init: RequestInit = {
        method: fetchOpts.method || 'GET',
        credentials: 'include',
        headers: fetchOpts.headers || {},
      };

      if (fetchOpts.body) {
        init.body = fetchOpts.body;
        (init.headers as Record<string, string>)['Content-Type'] =
          (init.headers as Record<string, string>)['Content-Type'] || 'application/json';
      }

      try {
        const res = await fetch(fetchUrl, init);
        const hdrs: Record<string, string> = {};
        res.headers.forEach((value, key) => { hdrs[key] = value; });
        return {
          ok: true as const,
          status: res.status,
          statusText: res.statusText,
          headers: hdrs,
          body: await res.text(),
        };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
          pageUrl: window.location.href,
        };
      }
    },
    url,
    {
      method: options.method,
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
  );

  if (!result.ok) {
    throw new Error(
      `fetch() failed inside browser: ${result.error}. Browser was at: ${result.pageUrl}`,
    );
  }

  return {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
    body: result.body,
  };
}
