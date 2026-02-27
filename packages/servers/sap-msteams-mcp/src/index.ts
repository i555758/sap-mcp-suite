#!/usr/bin/env node
/**
 * SAP MS Teams MCP Server
 *
 * An MCP server that provides access to Microsoft Teams via SAP SSO authentication.
 * Depends on sap-auth-mcp for web-based authentication.
 *
 * Usage:
 * 1. First authenticate using sap-auth-mcp:
 *    sap_authenticate with entry_url="https://teams.cloud.microsoft/v2/"
 * 2. Then use this MCP server's tools to interact with Teams
 */

import { TeamsServer } from "./server.js";
import { createLogger, isVerbose, getLogFilePath } from "./logger.js";

const log = createLogger("teams-mcp");

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_REGION = "emea";
const REGION = (process.env.SAP_TEAMS_REGION || DEFAULT_REGION) as "emea" | "amer" | "apac";

// ============================================================================
// Main Entry Point
// ============================================================================

const server = new TeamsServer(REGION);

log.info(`Region: ${REGION}`);
if (isVerbose()) {
  log.info(`Verbose mode enabled, logging to: ${getLogFilePath()}`);
}

server.run().catch((error) => {
  log.error("Fatal error:", error);
  process.exit(1);
});
