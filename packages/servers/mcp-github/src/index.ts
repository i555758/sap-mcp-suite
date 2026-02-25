#!/usr/bin/env node
/**
 * Main entry point for the GitHub MCP server
 */
import { GitHubServer } from './services/github-server.js';

// Get environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN as string;
const GITHUB_API_URL = process.env.GITHUB_API_URL || 'https://api.github.com';

// Validate environment variables
if (!GITHUB_TOKEN) {
  throw new Error(
    "GITHUB_TOKEN environment variable is required"
  );
}

console.error(`Starting GitHub MCP server with:
- GITHUB_API_URL: ${GITHUB_API_URL}`);

// Create and run the server
const server = new GitHubServer(GITHUB_API_URL, GITHUB_TOKEN);
server.run().catch(console.error);
