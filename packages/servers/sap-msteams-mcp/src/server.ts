/**
 * SAP MS Teams MCP Server
 *
 * MCP server setup and tool registration for Microsoft Teams integration.
 * Uses the delegated handler registration pattern for cleaner separation of concerns.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TeamsAuthManager } from "./services/auth.js";
import { TeamsApiClient } from "./api/teams-api.js";
import { GraphApiClient } from "./api/graph-api.js";
import { registerAllHandlers, TeamsHandlerContext } from "./handlers/index.js";

// ============================================================================
// TeamsServer Class
// ============================================================================

/**
 * Teams MCP Server class
 */
export class TeamsServer {
  private server: McpServer;
  private region: "emea" | "amer" | "apac";

  constructor(region: "emea" | "amer" | "apac" = "emea") {
    this.region = region;
    this.server = new McpServer({
      name: "sap-msteams-mcp",
      version: "1.0.0",
    });

    // Initialize auth manager and API clients
    const authManager = new TeamsAuthManager(undefined, region);
    const apiClient = new TeamsApiClient(authManager);
    const graphClient = new GraphApiClient(authManager);

    // Create handler context and register all tools
    const context: TeamsHandlerContext = {
      server: this.server,
      apiClient,
      graphClient,
    };

    registerAllHandlers(context);
  }

  /**
   * Run the server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`Teams MCP server running on stdio (region: ${this.region})`);
  }
}
