import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { StoredCookie, CookieStorage } from "../models/types.js";
import { logger } from "../utils/logger.js";

export class AuthManager {
  private cookieFile: string;
  private cookieDir: string;
  private apiToken: string;
  private authType: "api_token" | "cookies";

  constructor(apiToken: string | undefined, cookieDir: string | undefined) {
    if (apiToken) {
      this.authType = "api_token";
      this.apiToken = apiToken;
      this.cookieFile = "";
      this.cookieDir = "";
    } else {
      this.authType = "cookies";
      this.apiToken = "";
      if (!cookieDir) {
        // Use a fixed location in user's home directory
        // This ensures cookies are shared across different npx runs
        // ~/.sap-mcp/cookies/
        cookieDir = join(homedir(), ".sap-mcp", "cookies", "sap-jira");
      }

      this.cookieDir = cookieDir;
      // Use standardized filename sap_cookies.json
      this.cookieFile = join(cookieDir, "sap_cookies.json");
    }
  }

  getAuthType(): "api_token" | "cookies" {
    return this.authType;
  }

  getApiToken(): string {
    return this.apiToken;
  }

  /**
   * Get the directory where cookies are stored
   * @returns Cookie storage directory path
   */
  getCookieDir(): string {
    return this.cookieDir;
  }

  /**
   * Load cookies from storage
   */
  async getCookies(): Promise<StoredCookie[] | null> {
    try {
      logger.debug(`Attempting to read cookie file: ${this.cookieFile}`);
      const data = await fs.readFile(this.cookieFile, "utf8");
      logger.debug(`Cookie file read successful, size: ${data.length} bytes`);

      const cookieStorage: CookieStorage = JSON.parse(data);
      logger.info(
        `Loaded ${cookieStorage.cookies.length} cookies from storage`,
      );
      return cookieStorage.cookies;
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        logger.debug("No existing cookie file found");
        return null;
      }
      logger.error("Failed to load cookies:", error);
      return null;
    }
  }
}
