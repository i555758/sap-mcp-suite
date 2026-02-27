/**
 * SAP Auth MCP Server
 *
 * MCP server setup and tool registration for SAP authentication controls.
 * Uses the delegated handler registration pattern for cleaner separation of concerns.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AuthManager } from "sap-auth";
import { registerAllHandlers } from "./handlers/index.js";

/**
 * SAP Auth MCP Server class
 */
export class SAPAuthServer {
  private server: McpServer;
  private auth: AuthManager;

  constructor() {
    this.auth = AuthManager.getInstance();

    this.server = new McpServer({
      name: "sap-auth-mcp",
      version: "2.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    registerAllHandlers(this.server, this.auth);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SAP Auth MCP server running on stdio");
    console.error(`Auth storage: ${this.auth.getStoragePath()}`);
  }
}
