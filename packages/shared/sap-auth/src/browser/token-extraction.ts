/**
 * Token extraction utilities
 * Handles OAuth token and MSAL data extraction from browser localStorage
 */

import { Page } from 'puppeteer';
import type { StoredToken, StoredRefreshToken } from '../types.js';
import { parseJwt } from '../utils/jwt.js';

/**
 * MSAL data extracted from localStorage
 */
export interface MsalData {
  refreshToken?: StoredRefreshToken;
  account?: {
    homeAccountId: string;
    environment: string;
    tenantId: string;
    username: string;
    name?: string;
  };
}

/**
 * Extract OAuth tokens from localStorage
 */
export async function extractTokens(
  page: Page,
  targetAudiences: string[],
): Promise<StoredToken[]> {
  // Get all localStorage items
  const localStorageData = await page.evaluate(() => {
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
              tokenInfo.audience.includes(aud) || aud.includes(tokenInfo.audience),
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
 */
export async function extractMsalRefreshToken(page: Page): Promise<MsalData> {
  try {
    const msalData = await page.evaluate(() => {
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
    console.warn('Warning: Failed to extract MSAL refresh token:', error);
    return {};
  }
}
