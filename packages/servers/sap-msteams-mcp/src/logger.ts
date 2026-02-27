/**
 * Logger module for SAP MS Teams MCP
 *
 * Re-exports the shared mcp-logger configured for this service.
 */
import {
  createLogger as createSharedLogger,
  isVerbose,
  getLogFilePath as getSharedLogFilePath,
  Logger,
} from "mcp-logger";

// Service name for this package
const SERVICE_NAME = "sap-msteams-mcp";

/**
 * Create a logger instance with a specific prefix
 * @param prefix - Prefix for log messages
 */
export function createLogger(prefix: string): Logger {
  return createSharedLogger(SERVICE_NAME, prefix);
}

/**
 * Check if verbose mode is enabled
 */
export { isVerbose };

/**
 * Get the log file path
 */
export function getLogFilePath(): string {
  return getSharedLogFilePath(SERVICE_NAME);
}

export default Logger;
