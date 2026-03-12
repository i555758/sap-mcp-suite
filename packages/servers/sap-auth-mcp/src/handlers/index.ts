/**
 * Handler module exports for SAP Auth MCP
 * Re-exports all handler functions and the main registration function
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuthManager } from "sap-auth";

export {
  handleAuthenticate,
  handleMakeRequest,
  handleGetCookieInfo,
  handleClearAuths,
  registerAuthHandlers,
} from "./auth-handlers.js";

import { registerAuthHandlers } from "./auth-handlers.js";

/**
 * Register all handlers with the server
 */
export function registerAllHandlers(server: McpServer, auth: AuthManager): void {
  registerAuthHandlers(server, auth);
}
