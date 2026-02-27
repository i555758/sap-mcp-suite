/**
 * Shared types for Wiki handler modules
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpResponse } from "mcp-utils";
import { WikiHttpClient } from "../api/wiki-client.js";

/**
 * Auth error handler type - returns McpResponse for type compatibility with wrapToolHandler
 */
export type AuthErrorHandler = () => McpResponse;

/**
 * Context object passed to handler registration functions
 */
export interface WikiHandlerContext {
  server: McpServer;
  getHttpClient: () => Promise<WikiHttpClient>;
  apiToken?: string;
  authErrorHandler: AuthErrorHandler;
}
