#!/usr/bin/env node
/**
 * Main entry point for the GitHub MCP server
 */
import { GitHubServer } from './server.js';
import { GitHubAuthManager } from './services/auth-manager.js';

const GITHUB_API_URL = process.env.GITHUB_API_URL || 'https://api.github.com';

async function main() {
  const authManager = new GitHubAuthManager(GITHUB_API_URL);

  console.error(`Starting GitHub MCP server with:
- GITHUB_API_URL: ${GITHUB_API_URL}
- Auth: lazy (resolved on first tool call)
- Provider: ${authManager.getProviderId()}`);

  const server = new GitHubServer(GITHUB_API_URL, authManager);
  await server.run();
}

main().catch((error) => {
  console.error('Fatal error:', error.message || error);
  process.exit(1);
});
