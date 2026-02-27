#!/usr/bin/env node
/**
 * Main entry point for the Jira MCP server
 * Supports both API token and cookie-based authentication
 */
import { JiraServer } from "./services/jira-server.js";
import { AuthManager } from "./services/auth-manager.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { logger } from "./utils/logger.js";

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get environment variables
const JIRA_API_TOKEN: string | undefined = process.env.JIRA_API_TOKEN;
const JIRA_DOMAIN = (process.env.JIRA_DOMAIN as string) || "jira.tools.sap";
// Use the directory where index.js is located (dist/) if JIRA_CONFIG_DIR is not set
// This ensures .jira-config.json is found regardless of where the command is run from
const JIRA_CONFIG_DIR: string = process.env.JIRA_CONFIG_DIR || __dirname;

// Initialize AuthManager (uses shared sap-auth package)
const authManager = new AuthManager(JIRA_API_TOKEN);

async function main() {
  // Initialize auth manager (sets API token if provided)
  await authManager.initialize();

  logger.info(`Starting Jira MCP server with:
- JIRA_DOMAIN: ${JIRA_DOMAIN}
- JIRA_CONFIG_DIR: ${JIRA_CONFIG_DIR}
- Auth Storage: ${authManager.getCookieDir()}
- Current working directory: ${process.cwd()}
- Authentication: ${authManager.getAuthType()}
- Verbose logging: ${logger.isVerboseMode() ? `enabled (${logger.getLogFile()})` : "disabled"}`);

  // Create and run the server
  const server = new JiraServer(authManager, JIRA_DOMAIN, JIRA_CONFIG_DIR);
  await server.run();
}

main().catch((error) => logger.error("Server error:", error));
