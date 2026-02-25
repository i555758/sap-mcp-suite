import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { SAP_BrowserHybridAuth } from "./browser-hybrid-auth.js";
import { logger } from "./logger.js";

class SAPAuthServer {
  private server: Server;
  private auth: SAP_BrowserHybridAuth | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "sap-auth-mcp",
        version: "1.5.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
    this.setupCleanupHandlers();
  }

  private setupCleanupHandlers() {
    const cleanup = async () => {
      console.error("🧹 MCP Server: Cleaning up browser resources...");
      if (this.auth) {
        await this.auth.close();
        this.auth = null;
      }
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", async () => {
      if (this.auth) {
        await this.auth.close();
      }
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "sap_authenticate",
            description:
              "Authenticate with SAP systems using hybrid headless/visible Chrome approach",
            inputSchema: {
              type: "object",
              properties: {
                entry_url: {
                  type: "string",
                  description:
                    "SAP system entry URL (e.g., https://jira.tools.sap/, https://wiki.one.int.sap/)",
                },
                store_path: {
                  type: "string",
                  description:
                    "Directory path where to store sap_cookies.json file",
                },
              },
              required: ["entry_url", "store_path"],
            },
          },
          {
            name: "sap_make_request",
            description: "Make authenticated HTTP requests to SAP systems",
            inputSchema: {
              type: "object",
              properties: {
                url: {
                  type: "string",
                  description: "URL to make request to",
                },
                method: {
                  type: "string",
                  description: "HTTP method (GET, POST, etc.)",
                  default: "GET",
                },
                headers: {
                  type: "object",
                  description: "Additional headers to send",
                },
                body: {
                  type: "object",
                  description: "Request body for POST/PUT requests",
                },
              },
              required: ["url"],
            },
          },
          {
            name: "sap_get_cookie_info",
            description: "Get information about stored authentication cookies",
            inputSchema: {
              type: "object",
              properties: {
                store_path: {
                  type: "string",
                  description:
                    "Directory path where sap_cookies.json is stored (optional, uses default if not provided)",
                },
              },
            },
          },
          {
            name: "sap_clear_cookies",
            description: "Clear stored authentication cookies",
            inputSchema: {
              type: "object",
              properties: {
                store_path: {
                  type: "string",
                  description:
                    "Directory path where sap_cookies.json is stored (optional, uses default if not provided)",
                },
              },
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "sap_authenticate": {
            const entryUrl = args?.entry_url;
            const storePath = args?.store_path;

            if (!entryUrl || !storePath) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                "Both entry_url and store_path are required parameters",
              );
            }

            this.auth = new SAP_BrowserHybridAuth(
              entryUrl as string,
              storePath as string,
            );
            await this.auth.initialize();

            const success = await this.auth.authenticateWithHybridMode();

            return {
              content: [
                {
                  type: "text",
                  text: success
                    ? `✅ Successfully authenticated with ${entryUrl}\n📁 Cookie saved to: ${storePath}/sap_cookies.json`
                    : `❌ Authentication failed with ${entryUrl}`,
                },
              ],
            };
          }

          case "sap_make_request": {
            if (!this.auth) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                "No active authentication session. Please run sap_authenticate first.",
              );
            }

            const { url, method = "GET", headers = {}, body } = args || {};
            const options: any = { method, headers };
            if (body) {
              options.body = body;
            }

            const result = await this.auth.makeAuthenticatedRequest(
              url as string,
              options,
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "sap_get_cookie_info": {
            const storePath = args?.store_path;

            // Create a temporary auth instance for cookie operations
            const tempAuth = new SAP_BrowserHybridAuth(
              "https://wiki.one.int.sap/",
              storePath as string | undefined,
            );
            const info = await tempAuth.getCookieStorageInfo();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(info, null, 2),
                },
              ],
            };
          }

          case "sap_clear_cookies": {
            const storePath = args?.store_path;

            // Create a temporary auth instance for cookie operations
            const tempAuth = new SAP_BrowserHybridAuth(
              "https://wiki.one.int.sap/",
              storePath as string | undefined,
            );
            await tempAuth.clearStoredCookies();

            return {
              content: [
                {
                  type: "text",
                  text: storePath
                    ? `✅ Cleared stored authentication cookies from: ${storePath}/sap_cookies.json`
                    : "✅ Cleared stored authentication cookies from default location",
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`,
            );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        throw new McpError(ErrorCode.InternalError, errorMessage);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SAP Auth MCP server running on stdio");
  }
}

const server = new SAPAuthServer();
server.run().catch(console.error);
