/**
 * Provider registry - defines all supported auth providers
 */

import type { ProviderConfig } from '../types.js';

/**
 * Built-in provider configurations
 */
const PROVIDERS: Record<string, ProviderConfig> = {
  wiki: {
    id: 'wiki',
    name: 'SAP Wiki (Confluence)',
    method: 'sap-sso',
    entryUrl: 'https://wiki.one.int.sap/',
    domain: 'wiki.one.int.sap',
  },

  jira: {
    id: 'jira',
    name: 'SAP Jira',
    method: 'sap-sso', // Can be overridden to 'api-token'
    entryUrl: 'https://jira.tools.sap/',
    domain: 'jira.tools.sap',
    setupInstructions:
      'To use API token authentication:\n' +
      '1. Go to https://jira.tools.sap/secure/ViewProfile.jspa\n' +
      '2. Click "Personal Access Tokens"\n' +
      '3. Create a new token\n' +
      '4. Provide the token when prompted',
  },

  teams: {
    id: 'teams',
    name: 'Microsoft Teams',
    method: 'oauth',
    entryUrl: 'https://teams.cloud.microsoft/v2/',
    domain: 'teams.cloud.microsoft',
    tokenAudience: 'https://ic3.teams.office.com',
    additionalAudiences: [
      'https://api.spaces.skype.com',
      'https://chatsvcagg.teams.microsoft.com',
      'https://graph.microsoft.com',
    ],
  },

  graph: {
    id: 'graph',
    name: 'Microsoft Graph API',
    method: 'oauth',
    entryUrl: 'https://teams.cloud.microsoft/v2/', // Auth via Teams
    domain: 'graph.microsoft.com',
    tokenAudience: 'https://graph.microsoft.com',
  },
};

/**
 * Registry for auth providers
 */
export class ProviderRegistry {
  private static customProviders: Map<string, ProviderConfig> = new Map();

  /**
   * Get a provider configuration by ID
   */
  static get(providerId: string): ProviderConfig | undefined {
    // Check custom providers first
    if (this.customProviders.has(providerId)) {
      return this.customProviders.get(providerId);
    }
    return PROVIDERS[providerId];
  }

  /**
   * Check if a provider exists
   */
  static has(providerId: string): boolean {
    return this.customProviders.has(providerId) || providerId in PROVIDERS;
  }

  /**
   * Register a custom provider
   */
  static register(config: ProviderConfig): void {
    this.customProviders.set(config.id, config);
  }

  /**
   * List all provider IDs
   */
  static list(): string[] {
    const builtIn = Object.keys(PROVIDERS);
    const custom = Array.from(this.customProviders.keys());
    return [...new Set([...builtIn, ...custom])];
  }

  /**
   * Get all provider configs
   */
  static getAll(): ProviderConfig[] {
    const all = new Map<string, ProviderConfig>();

    // Built-in providers
    for (const [id, config] of Object.entries(PROVIDERS)) {
      all.set(id, config);
    }

    // Custom providers (override built-in if same ID)
    for (const [id, config] of this.customProviders) {
      all.set(id, config);
    }

    return Array.from(all.values());
  }
}

// Re-export individual provider IDs for convenience
export const WIKI_PROVIDER = 'wiki';
export const JIRA_PROVIDER = 'jira';
export const TEAMS_PROVIDER = 'teams';
export const GRAPH_PROVIDER = 'graph';
