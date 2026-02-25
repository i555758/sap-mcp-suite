import { promises as fs, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

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
  private readonly COOKIE_EXPIRY_HOURS = 24;

  constructor(storePath?: string) {
    if (storePath) {
      // Use provided store path with standardized filename
      this.cookieFile = join(storePath, "sap_cookies.json");
      // Ensure the store path directory exists
      this.ensureDirectoryExistsSync(storePath);
    } else {
      // Fallback to default location for backward compatibility
      const currentFileUrl = import.meta.url;
      const currentFilePath = fileURLToPath(currentFileUrl);
      const moduleDir = dirname(currentFilePath);
      const projectRoot = moduleDir.endsWith("dist")
        ? dirname(moduleDir)
        : dirname(moduleDir);
      const cookieDir = join(projectRoot, "tmp");
      this.cookieFile = join(cookieDir, "sap_cookies.json");
      // Ensure the default directory exists
      this.ensureDirectoryExistsSync(cookieDir);
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

      const content = JSON.stringify(cookieStorage, null, 2);

      // Write to file
      await fs.writeFile(this.cookieFile, content, "utf8");

      // Force file system sync to ensure data is written to disk
      // This prevents race conditions where other processes read before write completes
      const fileHandle = await fs.open(this.cookieFile, "r+");
      try {
        await fileHandle.sync(); // Flush all data to disk
      } finally {
        await fileHandle.close();
      }

      // Verify the file was written correctly by reading it back
      const verifyData = await fs.readFile(this.cookieFile, "utf8");
      const verifyParsed = JSON.parse(verifyData);
      if (verifyParsed.cookies.length !== cookies.length) {
        throw new Error(
          `Cookie verification failed: expected ${cookies.length} cookies, found ${verifyParsed.cookies.length}`,
        );
      }

      console.log(
        `Saved and verified ${cookies.length} cookies to ${this.cookieFile}`,
      );
    } catch (error) {
      console.error("Failed to save cookies:", error);
      throw error;
    }
  }

  /**
   * Load cookies from storage if they're still valid (within 24 hours)
   */
  async loadCookies(): Promise<StoredCookie[] | null> {
    try {
      const data = await fs.readFile(this.cookieFile, "utf8");
      const cookieStorage: CookieStorage = JSON.parse(data);

      // Check if cookies are still valid (within 24 hours)
      const now = Date.now();
      const cookieAge = now - cookieStorage.timestamp;
      const maxAge = this.COOKIE_EXPIRY_HOURS * 60 * 60 * 1000; // 24 hours in milliseconds

      if (cookieAge > maxAge) {
        console.log(
          `Cookies are ${Math.round(cookieAge / (60 * 60 * 1000))} hours old, need refresh`,
        );
        return null; // Cookies are too old
      }

      console.log(
        `Loaded ${cookieStorage.cookies.length} valid cookies (${Math.round(cookieAge / (60 * 1000))} minutes old)`,
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
   * Check if stored cookies are expired (older than 24 hours)
   */
  async areCookiesExpired(): Promise<boolean> {
    try {
      const data = await fs.readFile(this.cookieFile, "utf8");
      const cookieStorage: CookieStorage = JSON.parse(data);

      const now = Date.now();
      const cookieAge = now - cookieStorage.timestamp;
      const maxAge = this.COOKIE_EXPIRY_HOURS * 60 * 60 * 1000;

      return cookieAge > maxAge;
    } catch (error) {
      return true; // If we can't read the file, consider cookies expired
    }
  }

  /**
   * Get cookie age in hours
   */
  async getCookieAge(): Promise<number | null> {
    try {
      const data = await fs.readFile(this.cookieFile, "utf8");
      const cookieStorage: CookieStorage = JSON.parse(data);

      const now = Date.now();
      const cookieAge = now - cookieStorage.timestamp;
      return cookieAge / (60 * 60 * 1000); // Return age in hours
    } catch (error) {
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
    ageHours: number | null;
    expired: boolean;
    filePath: string;
  }> {
    const exists = await this.cookieFileExists();
    const ageHours = await this.getCookieAge();
    const expired = await this.areCookiesExpired();

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
      ageHours,
      expired,
      filePath: this.cookieFile,
    };
  }

  /**
   * Synchronously ensure directory exists during construction
   */
  private ensureDirectoryExistsSync(dirPath: string): void {
    try {
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
        console.log(`Created cookie storage directory: ${dirPath}`);
      }
    } catch (error) {
      console.error(
        `Failed to create cookie storage directory: ${dirPath}`,
        error,
      );
      throw new Error(`Cannot create cookie storage directory: ${dirPath}`);
    }
  }

  /**
   * Asynchronously ensure directory exists for file operations
   */
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

  /**
   * Get the directory where cookies and tokens are stored
   */
  getStoreDirectory(): string {
    return dirname(this.cookieFile);
  }
}
