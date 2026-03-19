/**
 * Storage layer for auth.json
 * Handles reading/writing auth data to ~/.sap-mcp/auth.json
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AuthStorage, StoredAuth } from './types.js';

const AUTH_DIR = join(homedir(), '.sap-mcp');
const AUTH_FILE = join(AUTH_DIR, 'auth.json');
const CURRENT_VERSION = 2;

/**
 * Storage singleton for auth data
 */
export class Storage {
  private static instance: Storage;
  private cache: AuthStorage | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5000; // 5 seconds

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): Storage {
    if (!Storage.instance) {
      Storage.instance = new Storage();
    }
    return Storage.instance;
  }

  /**
   * Get the auth file path
   */
  getAuthFilePath(): string {
    return AUTH_FILE;
  }

  /**
   * Ensure the auth directory exists
   */
  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(AUTH_DIR, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Load auth data from file
   */
  private async load(): Promise<AuthStorage> {
    // Check cache
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cache;
    }

    try {
      const data = await fs.readFile(AUTH_FILE, 'utf8');
      const storage = JSON.parse(data) as AuthStorage;

      // Migrate if needed
      if (!storage.version || storage.version < CURRENT_VERSION) {
        // v1 → v2: Rename 'github' provider to 'github-tools'
        if (storage.providers?.['github'] && !storage.providers?.['github-tools']) {
          storage.providers['github-tools'] = storage.providers['github'];
          delete storage.providers['github'];
        }
        storage.version = CURRENT_VERSION;
      }

      this.cache = storage;
      this.cacheTimestamp = now;
      return storage;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, return empty storage
        const empty: AuthStorage = {
          version: CURRENT_VERSION,
          providers: {},
        };
        this.cache = empty;
        this.cacheTimestamp = now;
        return empty;
      }
      throw error;
    }
  }

  /**
   * Save auth data to file with fsync verification
   * This prevents race conditions where other processes read before write completes
   */
  private async save(storage: AuthStorage): Promise<void> {
    await this.ensureDir();

    const content = JSON.stringify(storage, null, 2);
    await fs.writeFile(AUTH_FILE, content, 'utf8');

    // Force file system sync to ensure data is written to disk
    const fileHandle = await fs.open(AUTH_FILE, 'r+');
    try {
      await fileHandle.sync(); // Flush all data to disk
    } finally {
      await fileHandle.close();
    }

    // Verify the file was written correctly by reading it back
    const verifyData = await fs.readFile(AUTH_FILE, 'utf8');
    const verifyParsed = JSON.parse(verifyData);
    if (Object.keys(verifyParsed.providers).length !== Object.keys(storage.providers).length) {
      throw new Error(
        `Storage verification failed: expected ${Object.keys(storage.providers).length} providers, found ${Object.keys(verifyParsed.providers).length}`,
      );
    }

    // Update cache
    this.cache = storage;
    this.cacheTimestamp = Date.now();
  }

  /**
   * Get auth data for a specific provider
   */
  async get<T extends StoredAuth>(providerId: string): Promise<T | null> {
    const storage = await this.load();
    const auth = storage.providers[providerId];
    return (auth as T) || null;
  }

  /**
   * Set auth data for a specific provider
   */
  async set(providerId: string, auth: StoredAuth): Promise<void> {
    const storage = await this.load();
    storage.providers[providerId] = {
      ...auth,
      updatedAt: new Date().toISOString(),
    };
    await this.save(storage);
  }

  /**
   * Delete auth data for a specific provider
   */
  async delete(providerId: string): Promise<void> {
    const storage = await this.load();
    delete storage.providers[providerId];
    await this.save(storage);
  }

  /**
   * Check if provider has stored auth
   */
  async has(providerId: string): Promise<boolean> {
    const storage = await this.load();
    return providerId in storage.providers;
  }

  /**
   * List all configured provider IDs
   */
  async listProviders(): Promise<string[]> {
    const storage = await this.load();
    return Object.keys(storage.providers);
  }

  /**
   * Clear all auth data
   */
  async clearAll(): Promise<void> {
    await this.save({
      version: CURRENT_VERSION,
      providers: {},
    });
  }

  /**
   * Invalidate cache (forces reload on next access)
   */
  invalidateCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Get raw storage data (for debugging)
   */
  async getAll(): Promise<AuthStorage> {
    return await this.load();
  }

  /**
   * Get the storage directory path
   */
  getStorageDir(): string {
    return AUTH_DIR;
  }
}
