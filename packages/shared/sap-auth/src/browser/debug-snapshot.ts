/**
 * Debug snapshot utilities
 * Saves screenshots and HTML dumps when SSO authentication fails,
 * providing diagnostic artifacts for troubleshooting.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Page } from 'puppeteer';

const LOGS_DIR = join(homedir(), '.sap-mcp', 'logs');

/**
 * Save a debug snapshot (PNG screenshot + HTML dump) of the current page.
 *
 * This is a best-effort diagnostic helper -- it never throws so it can be
 * safely called from any error/fallback path without disrupting the flow.
 */
export async function saveDebugSnapshot(page: Page, label: string): Promise<void> {
  try {
    mkdirSync(LOGS_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `${timestamp}_${label}`;

    const screenshotPath = join(LOGS_DIR, `${baseName}.png`);
    const htmlPath = join(LOGS_DIR, `${baseName}.html`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    writeFileSync(htmlPath, await page.content(), 'utf8');

    console.error(`[debug-snapshot] Screenshot saved: ${screenshotPath}`);
    console.error(`[debug-snapshot] HTML dump saved:  ${htmlPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[debug-snapshot] Failed to save snapshot (${label}): ${msg}`);
  }
}
