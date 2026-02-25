import { promises as fs } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface CookieStorage {
  cookies: StoredCookie[];
  timestamp: number;
  domain: string;
}

export class CookieStore {
  private cookieFile: string;

  constructor(domain: string = "wiki.one.int.sap", customStorePath?: string) {
    // Priority order: 1) customStorePath parameter, 2) AUTH_COOKIE_DIR env var, 3) default
    const storePath = customStorePath || process.env.AUTH_COOKIE_DIR;

    if (storePath) {
      // Use custom store path (from parameter or environment variable)
      this.cookieFile = join(storePath, "sap_cookies.json");
    } else {
      // Default: Store cookies in a fixed location relative to this module
      // This works regardless of where the process is started from
      const currentFileUrl = import.meta.url;
      const currentFilePath = fileURLToPath(currentFileUrl);
      const moduleDir = dirname(currentFilePath);

      // If we're in dist/, go up to project root, otherwise we're in src/
      const projectRoot = moduleDir.endsWith("dist")
        ? dirname(moduleDir)
        : dirname(moduleDir);
      const cookieDir = join(projectRoot, "tmp");

      // Use standard sap_cookies.json filename
      this.cookieFile = join(cookieDir, "sap_cookies.json");
    }
  }

  /**
   * Save cookies to storage with current timestamp
   */
  async saveCookies(
    cookies: any[],
    domain: string = "wiki.one.int.sap",
  ): Promise<void> {
    try {
      // Ensure directory exists
      await this.ensureDirectoryExists();

      // Convert Puppeteer cookies to our storage format
      const storedCookies: StoredCookie[] = cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      }));

      const cookieStorage: CookieStorage = {
        cookies: storedCookies,
        timestamp: Date.now(),
        domain: domain,
      };

      await fs.writeFile(
        this.cookieFile,
        JSON.stringify(cookieStorage, null, 2),
        "utf8",
      );
      console.log(`Saved ${cookies.length} cookies to ${this.cookieFile}`);
    } catch (error) {
      console.error("Failed to save cookies:", error);
      throw error;
    }
  }

  /**
   * Load cookies from storage
   */
  async loadCookies(): Promise<StoredCookie[] | null> {
    try {
      const data = await fs.readFile(this.cookieFile, "utf8");
      const cookieStorage: CookieStorage = JSON.parse(data);

      console.log(
        `Loaded ${cookieStorage.cookies.length} cookies from storage`,
      );
      return cookieStorage.cookies;
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        console.log("No existing cookie file found");
        return null;
      }
      console.error("Failed to load cookies:", error);
      return null;
    }
  }

  /**
   * Clear stored cookies
   */
  async clearCookies(): Promise<void> {
    try {
      await fs.unlink(this.cookieFile);
      console.log("Cleared stored cookies");
    } catch (error) {
      if ((error as any).code !== "ENOENT") {
        console.error("Failed to clear cookies:", error);
      }
    }
  }

  /**
   * Convert stored cookies back to Puppeteer format
   */
  convertToPuppeteerFormat(storedCookies: StoredCookie[]): any[] {
    return storedCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    }));
  }

  /**
   * Get cookie storage information
   */
  async getStorageInfo(): Promise<{
    exists: boolean;
    cookieCount: number;
    filePath: string;
  }> {
    const exists = await this.cookieFileExists();

    let cookieCount = 0;
    if (exists) {
      try {
        const data = await fs.readFile(this.cookieFile, "utf8");
        const cookieStorage: CookieStorage = JSON.parse(data);
        cookieCount = cookieStorage.cookies.length;
      } catch (error) {
        // Ignore errors when getting count
      }
    }

    return {
      exists,
      cookieCount,
      filePath: this.cookieFile,
    };
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = join(this.cookieFile, "..");
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }

  private async cookieFileExists(): Promise<boolean> {
    try {
      await fs.access(this.cookieFile);
      return true;
    } catch (error) {
      return false;
    }
  }
}
