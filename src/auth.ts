/**
 * Authentication module for SAP MS Teams MCP
 *
 * This module handles token extraction from sap-auth-mcp.
 * The sap-auth-mcp must be used first to complete SAP SSO login for Teams.
 *
 * Token Sources (in priority order):
 * 1. sap_tokens.json - JWT tokens extracted from browser localStorage by sap-auth-mcp
 * 2. sap_cookies.json - Cookies containing JWT tokens (fallback)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { TokenData, Cookie, GraphToken, SapTokensFile } from "./types.js";
import { createLogger } from "./logger.js";

const log = createLogger("teams-auth");

// ============================================================================
// Constants
// ============================================================================

const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer before expiry
const DEFAULT_COOKIE_STORE_PATH = path.join(os.homedir(), ".sap-auth-mcp");

// Known cookie names that may contain auth tokens for Teams
const TOKEN_COOKIE_NAMES = [
  "authtoken_asm",
  "authtoken_asm_urlp",
  "authtoken",
  "skypetoken_asm",
];

// Target audiences for Teams Chat API
const TEAMS_API_AUDIENCES = [
  "https://ic3.teams.office.com",
  "https://api.spaces.skype.com",
  "https://chatsvcagg.teams.microsoft.com",
  "ic3.teams.office.com",
  "api.spaces.skype.com",
];

// ============================================================================
// File Path Helpers
// ============================================================================

function getSapCookiesFilePath(cookieStorePath: string): string {
  return path.join(cookieStorePath, "sap_cookies.json");
}

function getSapTokensFilePath(cookieStorePath: string): string {
  return path.join(cookieStorePath, "sap_tokens.json");
}

// ============================================================================
// Token File Reading
// ============================================================================

/**
 * Read tokens from sap_tokens.json (saved by sap-auth-mcp)
 */
export function readSapTokens(
  cookieStorePath: string = DEFAULT_COOKIE_STORE_PATH,
): SapTokensFile | null {
  try {
    const tokensFile = getSapTokensFilePath(cookieStorePath);
    log.debug(`Reading tokens from ${tokensFile}`);
    if (fs.existsSync(tokensFile)) {
      const data = JSON.parse(fs.readFileSync(tokensFile, "utf8"));
      log.debug(`Found ${data.tokens?.length || 0} tokens in sap_tokens.json`);
      return data;
    }
    log.debug("sap_tokens.json not found");
  } catch (e) {
    log.error("Error reading sap_tokens.json:", e);
  }
  return null;
}

/**
 * Read cookies from sap_cookies.json (saved by sap-auth-mcp)
 */
export function readSapCookies(
  cookieStorePath: string = DEFAULT_COOKIE_STORE_PATH,
): Cookie[] | null {
  try {
    const cookiesFile = getSapCookiesFilePath(cookieStorePath);
    log.debug(`Reading cookies from ${cookiesFile}`);
    if (fs.existsSync(cookiesFile)) {
      const data = JSON.parse(fs.readFileSync(cookiesFile, "utf8"));
      const cookies = data.cookies || data;
      log.debug(`Found ${cookies?.length || 0} cookies in sap_cookies.json`);
      return cookies;
    }
    log.debug("sap_cookies.json not found");
  } catch (e) {
    log.error("Error reading sap_cookies.json:", e);
  }
  return null;
}

// ============================================================================
// Token Extraction from sap_tokens.json
// ============================================================================

/**
 * Get Teams API token from sap_tokens.json
 */
export function getTeamsApiToken(
  cookieStorePath: string = DEFAULT_COOKIE_STORE_PATH,
): GraphToken | null {
  const tokensData = readSapTokens(cookieStorePath);
  if (!tokensData?.tokens) {
    log.debug("No tokens data available");
    return null;
  }

  // Find token with Teams API audience
  for (const audience of TEAMS_API_AUDIENCES) {
    const token = tokensData.tokens.find(
      (t) => t.audience.toLowerCase() === audience.toLowerCase(),
    );
    if (token) {
      // Check if token is still valid (5 min buffer)
      const now = Date.now() / 1000;
      if (token.expiresAt > now + 300) {
        log.debug(`Found valid Teams token with audience: ${token.audience}`);
        return token;
      }
      log.debug(`Teams token with audience ${token.audience} is expired`);
    }
  }

  log.debug("No valid Teams API token found in sap_tokens.json");
  return null;
}

/**
 * Get Graph API token from sap_tokens.json
 */
export function getGraphApiToken(
  cookieStorePath: string = DEFAULT_COOKIE_STORE_PATH,
): GraphToken | null {
  const tokensData = readSapTokens(cookieStorePath);
  if (!tokensData?.tokens) return null;

  const token = tokensData.tokens.find(
    (t) => t.audience.toLowerCase() === "https://graph.microsoft.com",
  );

  if (token) {
    const now = Date.now() / 1000;
    if (token.expiresAt > now + 300) {
      log.debug(
        `Found valid Graph token with ${token.scopes?.length || 0} scopes`,
      );
      return token;
    }
    log.debug("Graph token is expired");
  }

  return null;
}

// ============================================================================
// Token Extraction from Cookies (Fallback)
// ============================================================================

/**
 * Decode JWT token and extract payload
 */
export function decodeJwtToken(
  token: string,
): { header: any; payload: any } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(Buffer.from(parts[0], "base64").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Extract JWT token from a cookie value
 */
function extractJwtFromCookieValue(value: string): string | null {
  if (!value) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }

  const jwtMatch = decoded.match(
    /(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/,
  );
  if (jwtMatch) {
    return jwtMatch[1];
  }

  return null;
}

/**
 * Extract Teams API token from cookies (fallback method)
 */
export function extractTokenFromCookies(cookies: Cookie[]): TokenData | null {
  if (!cookies || !Array.isArray(cookies)) return null;

  // First pass: look for specific Teams cookies
  for (const cookieName of TOKEN_COOKIE_NAMES) {
    const cookie = cookies.find((c) => c.name === cookieName);
    if (cookie?.value) {
      const jwt = extractJwtFromCookieValue(cookie.value);
      if (jwt) {
        const decoded = decodeJwtToken(jwt);
        if (decoded?.payload) {
          const payload = decoded.payload;
          const aud = payload.aud || "";

          const isTeamsAudience = TEAMS_API_AUDIENCES.some((a) =>
            aud.includes(a.replace("https://", "")),
          );
          if (isTeamsAudience) {
            log.debug(
              `Found token in cookie '${cookieName}' with audience: ${aud}`,
            );
            return {
              token: jwt,
              aud: aud,
              exp: payload.exp,
              expDate: new Date(payload.exp * 1000).toISOString(),
              refreshedAt: new Date().toISOString(),
            };
          }
        }
      }
    }
  }

  // Second pass: look through all cookies
  log.verbose("Scanning all cookies for Teams token...");
  for (const cookie of cookies) {
    if (cookie.value) {
      const jwt = extractJwtFromCookieValue(cookie.value);
      if (jwt) {
        const decoded = decodeJwtToken(jwt);
        if (decoded?.payload) {
          const payload = decoded.payload;
          const aud = payload.aud || "";

          const isTeamsAudience = TEAMS_API_AUDIENCES.some((a) =>
            aud.includes(a.replace("https://", "")),
          );
          if (isTeamsAudience) {
            return {
              token: jwt,
              aud: aud,
              exp: payload.exp,
              expDate: new Date(payload.exp * 1000).toISOString(),
              refreshedAt: new Date().toISOString(),
            };
          }
        }
      }
    }
  }

  return null;
}

// ============================================================================
// Token Validation Helpers
// ============================================================================

/**
 * Check if token is still valid (not expired)
 */
export function isTokenValid(tokenData: TokenData | null | undefined): boolean {
  if (!tokenData?.token || !tokenData?.exp) return false;
  const expiresAt = tokenData.exp * 1000;
  return Date.now() < expiresAt - EXPIRY_BUFFER_MS;
}

/**
 * Get remaining time before token expires (in minutes)
 */
export function getTokenRemainingMinutes(
  tokenData: TokenData | null | undefined,
): number {
  if (!tokenData?.exp) return 0;
  const remaining = (tokenData.exp * 1000 - Date.now()) / 60000;
  return Math.max(0, Math.round(remaining));
}

// ============================================================================
// Authentication Manager Class
// ============================================================================

export class TeamsAuthManager {
  private cookieStorePath: string;
  private cachedTeamsToken: GraphToken | null = null;
  private cachedGraphToken: GraphToken | null = null;
  private region: string;

  constructor(
    cookieStorePath: string = DEFAULT_COOKIE_STORE_PATH,
    region: string = "emea",
  ) {
    this.cookieStorePath = cookieStorePath;
    this.region = region;
  }

  /**
   * Get the API base URL for the configured region
   */
  getApiBase(): string {
    return `https://teams.cloud.microsoft/api/chatsvc/${this.region}/v1/users/ME`;
  }

  /**
   * Get the configured region
   */
  getRegion(): string {
    return this.region;
  }

  /**
   * Get the cookie store path
   */
  getCookieStorePath(): string {
    return this.cookieStorePath;
  }

  /**
   * Get Teams Chat API token
   * Priority: sap_tokens.json > sap_cookies.json
   */
  async getToken(): Promise<string> {
    log.debug("Getting Teams Chat API token...");

    // 1. Check cached token
    if (this.cachedTeamsToken) {
      const now = Date.now() / 1000;
      if (this.cachedTeamsToken.expiresAt > now + 300) {
        const remaining = Math.round(
          (this.cachedTeamsToken.expiresAt - now) / 60,
        );
        log.debug(`Using cached Teams token (${remaining}m remaining)`);
        return this.cachedTeamsToken.token;
      }
      log.debug("Cached Teams token expired, clearing cache");
      this.cachedTeamsToken = null;
    }

    // 2. Try sap_tokens.json first (primary source)
    log.debug("Trying sap_tokens.json...");
    const teamsToken = getTeamsApiToken(this.cookieStorePath);
    if (teamsToken) {
      this.cachedTeamsToken = teamsToken;
      const remaining = Math.round(
        (teamsToken.expiresAt - Date.now() / 1000) / 60,
      );
      log.info(
        `Using Teams token from sap_tokens.json (${remaining}m remaining, audience: ${teamsToken.audience})`,
      );
      return teamsToken.token;
    }

    // 3. Fallback: try sap_cookies.json
    log.debug("Trying sap_cookies.json (fallback)...");
    const cookies = readSapCookies(this.cookieStorePath);
    if (cookies) {
      const tokenData = extractTokenFromCookies(cookies);
      if (tokenData && isTokenValid(tokenData)) {
        // Convert to GraphToken format for caching
        this.cachedTeamsToken = {
          token: tokenData.token,
          audience: tokenData.aud,
          expiresAt: tokenData.exp,
          scopes: [],
        };
        log.info(
          `Using Teams token from sap_cookies.json (audience: ${tokenData.aud})`,
        );
        return tokenData.token;
      }
    }

    // 4. No valid token found
    log.error("No valid Teams API token found");
    throw new Error(
      `No valid Teams API token found. Please authenticate with Teams using sap-auth-mcp:\n` +
        `  sap_authenticate with entry_url="https://teams.cloud.microsoft/v2/" and store_path="${this.cookieStorePath}"`,
    );
  }

  /**
   * Get Graph API token from sap_tokens.json
   */
  getGraphToken(): string | null {
    log.debug("Getting Graph API token...");

    // Check cache first
    if (this.cachedGraphToken) {
      const now = Date.now() / 1000;
      if (this.cachedGraphToken.expiresAt > now + 300) {
        log.debug("Using cached Graph token");
        return this.cachedGraphToken.token;
      }
      log.debug("Cached Graph token expired, clearing cache");
      this.cachedGraphToken = null;
    }

    // Read from sap_tokens.json
    const graphToken = getGraphApiToken(this.cookieStorePath);
    if (graphToken) {
      this.cachedGraphToken = graphToken;
      const remaining = Math.round(
        (graphToken.expiresAt - Date.now() / 1000) / 60,
      );
      log.info(
        `Using Graph token (${remaining}m remaining, scopes: ${graphToken.scopes?.length || 0})`,
      );
      return graphToken.token;
    }

    log.debug("No valid Graph API token found");
    return null;
  }

  /**
   * Check if Graph API token is available
   */
  hasGraphToken(): boolean {
    return this.getGraphToken() !== null;
  }

  /**
   * Invalidate cached tokens (forces re-read on next request)
   */
  invalidateToken(): void {
    this.cachedTeamsToken = null;
    this.cachedGraphToken = null;
  }

  /**
   * Get status information about the current authentication state
   */
  getStatus(): {
    hasTeamsToken: boolean;
    hasGraphToken: boolean;
    teamsTokenRemaining: number;
    graphTokenRemaining: number;
  } {
    const teamsToken = getTeamsApiToken(this.cookieStorePath);
    const graphToken = getGraphApiToken(this.cookieStorePath);
    const now = Date.now() / 1000;

    return {
      hasTeamsToken: !!teamsToken,
      hasGraphToken: !!graphToken,
      teamsTokenRemaining: teamsToken
        ? Math.max(0, Math.round((teamsToken.expiresAt - now) / 60))
        : 0,
      graphTokenRemaining: graphToken
        ? Math.max(0, Math.round((graphToken.expiresAt - now) / 60))
        : 0,
    };
  }
}

export default TeamsAuthManager;
