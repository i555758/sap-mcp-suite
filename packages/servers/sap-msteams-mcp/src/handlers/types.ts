/**
 * Shared types for Teams handler modules
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamsApiClient } from "../api/teams-api.js";
import type { GraphApiClient } from "../api/graph-api.js";

/**
 * Context object passed to handler registration functions
 */
export interface TeamsHandlerContext {
  server: McpServer;
  apiClient: TeamsApiClient;
  graphClient: GraphApiClient;
}
