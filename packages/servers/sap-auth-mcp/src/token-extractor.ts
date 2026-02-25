import { promises as fs } from "fs";
import { Page } from "puppeteer";
import { logger } from "./logger.js";

export interface ExtractedToken {
  token: string;
  audience: string;
  expiresAt: number;
  scopes: string[];
  appDisplayName?: string;
  key?: string;
}

export interface TokenStorage {
  tokens: ExtractedToken[];
  timestamp: number;
  source: string;
}

/**
 * Extract Microsoft Graph API tokens from browser's localStorage
 * Uses Puppeteer's native API for Chrome/Edge compatibility
 */
export class TokenExtractor {
  /**
   * Check if the URL is a Microsoft Teams URL
   */
  static isTeamsUrl(url: string): boolean {
    const teamsPatterns = [
      "teams.microsoft.com",
      "teams.cloud.microsoft",
      "teams.live.com",
      "teams.office.com",
    ];
    return teamsPatterns.some((pattern) => url.includes(pattern));
  }

  /**
   * Extract Graph API tokens from localStorage using Puppeteer's page.evaluate()
   */
  static async extractGraphTokensFromPage(
    page: Page,
  ): Promise<ExtractedToken[]> {
    logger.enter("extractGraphTokensFromPage");

    try {
      // Use Puppeteer's evaluate to access localStorage directly in the browser
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

      const tokens: ExtractedToken[] = [];
      const jwtPattern = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

      logger.token("Scanning localStorage", {
        itemCount: localStorageData.length,
      });

      // Audiences we want to extract tokens for
      const targetAudiences = [
        "https://graph.microsoft.com", // Graph API
        "ic3.teams.office.com", // Teams Chat API
        "teams.office.com", // Teams API
        "api.spaces.skype.com", // Skype/Teams API
        "chatsvcagg.teams.microsoft.com", // Teams Chat Service
      ];

      for (const item of localStorageData) {
        // Find JWT tokens in the value
        const matches = item.value.match(jwtPattern);
        if (matches) {
          for (const jwt of matches) {
            const tokenInfo = TokenExtractor.parseJwtToken(jwt);
            if (tokenInfo) {
              // Check if audience matches any of our targets
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
                  scopes: tokenInfo.scopes,
                  appDisplayName: tokenInfo.appDisplayName,
                  key: item.key,
                });
              }
            }
          }
        }
      }

      // Remove duplicates (keep the one with latest expiry)
      const uniqueTokens = TokenExtractor.deduplicateTokens(tokens);

      if (uniqueTokens.length > 0) {
        const audiences = [...new Set(uniqueTokens.map((t) => t.audience))];
        console.log(
          `🔑 Extracted ${uniqueTokens.length} valid token(s) from localStorage (audiences: ${audiences.join(", ")})`,
        );
        logger.token("Extracted tokens", {
          count: uniqueTokens.length,
          audiences,
          expirations: uniqueTokens.map((t) => ({
            aud: t.audience,
            exp: new Date(t.expiresAt * 1000).toISOString(),
          })),
        });
      } else {
        logger.token("No valid tokens found in localStorage");
      }

      return uniqueTokens;
    } catch (error) {
      console.warn("⚠️ Failed to extract tokens from localStorage:", error);
      return [];
    }
  }

  /**
   * Parse JWT token to extract payload information
   */
  static parseJwtToken(token: string): {
    audience: string;
    expiresAt: number;
    scopes: string[];
    appDisplayName?: string;
  } | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) {
        return null;
      }

      // Decode the payload (second part)
      const payload = parts[1];
      const decoded = TokenExtractor.base64UrlDecode(payload);
      const json = JSON.parse(decoded);

      // Extract relevant fields
      return {
        audience: json.aud || "",
        expiresAt: json.exp || 0,
        scopes: json.scp ? json.scp.split(" ") : [],
        appDisplayName: json.app_displayname,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Base64 URL decode (JWT uses URL-safe base64)
   */
  static base64UrlDecode(str: string): string {
    // Replace URL-safe characters
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");

    // Add padding if needed
    const pad = base64.length % 4;
    if (pad) {
      base64 += "=".repeat(4 - pad);
    }

    // Decode
    return Buffer.from(base64, "base64").toString("utf8");
  }

  /**
   * Remove duplicate tokens (keep the one with latest expiry)
   */
  static deduplicateTokens(tokens: ExtractedToken[]): ExtractedToken[] {
    const tokenMap = new Map<string, ExtractedToken>();

    for (const token of tokens) {
      // Use token hash as key to detect true duplicates
      const tokenHash = token.token.substring(0, 50);
      const existing = tokenMap.get(tokenHash);

      if (!existing || token.expiresAt > existing.expiresAt) {
        tokenMap.set(tokenHash, token);
      }
    }

    return Array.from(tokenMap.values());
  }

  /**
   * Save extracted tokens to a JSON file
   */
  static async saveTokens(
    tokens: ExtractedToken[],
    outputPath: string,
  ): Promise<void> {
    const storage: TokenStorage = {
      tokens,
      timestamp: Date.now(),
      source: "localStorage",
    };

    await fs.writeFile(outputPath, JSON.stringify(storage, null, 2), "utf8");
    console.log(`💾 Saved ${tokens.length} token(s) to ${outputPath}`);
  }

  /**
   * Load tokens from a JSON file
   */
  static async loadTokens(filePath: string): Promise<ExtractedToken[]> {
    try {
      const data = await fs.readFile(filePath, "utf8");
      const storage: TokenStorage = JSON.parse(data);

      // Filter out expired tokens
      const validTokens = storage.tokens.filter(
        (t) => t.expiresAt > Date.now() / 1000,
      );

      if (validTokens.length < storage.tokens.length) {
        console.log(
          `⏰ ${storage.tokens.length - validTokens.length} token(s) have expired`,
        );
      }

      return validTokens;
    } catch (error) {
      return [];
    }
  }
}
