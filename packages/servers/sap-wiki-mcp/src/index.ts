#!/usr/bin/env node
/**
 * Main entry point for the Wiki MCP server
 * Supports both API token and cookie-based authentication
 */
import { WikiServer } from "./server.js";

// Read configuration from environment variables
const WIKI_DOMAIN = process.env.WIKI_DOMAIN;
const WIKI_API_TOKEN = process.env.WIKI_API_TOKEN;

// Log configuration mode at startup
if (WIKI_DOMAIN && WIKI_API_TOKEN) {
  console.error(
    `Custom domain mode: ${WIKI_DOMAIN} with PAT authentication`,
  );
} else if (WIKI_DOMAIN) {
  console.error(
    `WIKI_DOMAIN set but WIKI_API_TOKEN missing. Falling back to default domain.`,
  );
} else {
  console.error(
    `SAP Wiki mode: wiki.one.int.sap with cookie authentication`,
  );
}

// Create and run the server
const server = new WikiServer(WIKI_DOMAIN, WIKI_API_TOKEN);
server.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
