/**
 * Logger module for SAP Jira MCP
 *
 * Re-exports the shared mcp-logger configured for this service.
 */
import { createLogger, isVerbose, getLogFilePath } from "mcp-logger";

// Create and export a singleton logger instance for this service
export const logger = createLogger("sap-jira-mcp", "jira");

// Re-export utility functions
export { isVerbose, getLogFilePath };
