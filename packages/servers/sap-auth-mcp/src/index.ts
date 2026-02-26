/**
 * SAP Auth MCP Server
 *
 * This MCP provides manual authentication controls to Claude, allowing users to:
 * - Trigger authentication for SAP systems (wiki, jira, teams, graph)
 * - Check authentication status
 * - Clear stored credentials
 * - Make authenticated requests
 *
 * This is a thin wrapper around the shared @anthropic/sap-auth package.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  AuthManager,
  AuthError,
  AuthBrowserError,
  ApiTokenRequiredError,
} from "@anthropic/sap-auth";

/**
 * Map URL to provider ID
 */
function urlToProviderId(url: string): string | null {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes("wiki.one.int.sap") || lowerUrl.includes("wiki")) {
    return "wiki";
  }
  if (lowerUrl.includes("jira.tools.sap") || lowerUrl.includes("jira")) {
    return "jira";
  }
  if (
    lowerUrl.includes("teams.microsoft.com") ||
    lowerUrl.includes("teams.cloud.microsoft") ||
    lowerUrl.includes("teams")
  ) {
    return "teams";
  }
  if (lowerUrl.includes("graph.microsoft.com") || lowerUrl.includes("graph")) {
    return "graph";
  }

  return null;
}

class SAPAuthServer {
  private server: Server;
  private auth: AuthManager;

  constructor() {
    this.auth = AuthManager.getInstance();

    this.server = new Server(
      {
        name: "sap-auth-mcp",
        version: "2.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupToolHandlers();
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
              },
              required: ["entry_url"],
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
            description: "Get information about stored authentication credentials",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "sap_clear_cookies",
            description: "Clear stored authentication credentials",
            inputSchema: {
              type: "object",
              properties: {},
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
            const entryUrl = args?.entry_url as string;

            if (!entryUrl) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                "entry_url is required",
              );
            }

            // Map URL to provider ID
            const providerId = urlToProviderId(entryUrl);
            if (!providerId) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Unknown SAP system URL: ${entryUrl}. Supported: wiki.one.int.sap, jira.tools.sap, teams.microsoft.com`,
              );
            }

            try {
              // Force re-authentication
              const credentials = await this.auth.forceReauth(providerId);

              return {
                content: [
                  {
                    type: "text",
                    text:
                      `Successfully authenticated with ${providerId} (${entryUrl})\n` +
                      `Credential type: ${credentials.type}\n` +
                      `Expires: ${credentials.expiresAt ? credentials.expiresAt.toISOString() : "N/A"}\n` +
                      `Storage: ${this.auth.getStoragePath()}`,
                  },
                ],
              };
            } catch (error) {
              if (error instanceof AuthBrowserError) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `Authentication failed for ${providerId}: ${error.message}`,
                    },
                  ],
                };
              }
              if (error instanceof ApiTokenRequiredError) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `API token required for ${providerId}:\n${error.instructions}`,
                    },
                  ],
                };
              }
              throw error;
            }
          }

          case "sap_make_request": {
            const { url, method = "GET", headers = {}, body } = args || {};

            if (!url) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                "URL is required for sap_make_request",
              );
            }

            // Determine provider from URL
            const providerId = urlToProviderId(url as string);
            if (!providerId) {
              throw new McpError(
                ErrorCode.InvalidRequest,
                `Cannot determine provider for URL: ${url}`,
              );
            }

            try {
              // Get credentials for this provider
              const credentials = await this.auth.getCredentials(providerId);

              // Build request headers
              const requestHeaders: Record<string, string> = {
                ...(headers as Record<string, string>),
              };

              if (credentials.type === "cookie") {
                requestHeaders["Cookie"] = credentials.value;
              } else if (
                credentials.type === "bearer" ||
                credentials.type === "api-token"
              ) {
                requestHeaders["Authorization"] = `Bearer ${credentials.value}`;
              }

              // Make the request
              const fetchOptions: RequestInit = {
                method: method as string,
                headers: requestHeaders,
              };

              if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
                fetchOptions.body = JSON.stringify(body);
                requestHeaders["Content-Type"] = "application/json";
              }

              const response = await fetch(url as string, fetchOptions);
              const responseText = await response.text();

              let responseData: unknown;
              try {
                responseData = JSON.parse(responseText);
              } catch {
                responseData = responseText;
              }

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: response.status,
                        statusText: response.statusText,
                        headers: Object.fromEntries(response.headers.entries()),
                        data: responseData,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            } catch (error) {
              if (error instanceof AuthError) {
                throw new McpError(
                  ErrorCode.InternalError,
                  `Authentication error: ${error.message}. Please run sap_authenticate first.`,
                );
              }
              throw error;
            }
          }

          case "sap_get_cookie_info": {
            const statuses = await this.auth.listProviders();
            const storagePath = this.auth.getStoragePath();

            const result = {
              storagePath,
              providers: statuses.map((status) => ({
                providerId: status.providerId,
                configured: status.configured,
                valid: status.valid,
                method: status.method,
                expiresAt: status.expiresAt?.toISOString() || null,
                expiresInMinutes: status.expiresInMinutes,
              })),
            };

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "sap_clear_cookies": {
            await this.auth.clearAll();

            return {
              content: [
                {
                  type: "text",
                  text: `Cleared all stored authentication credentials from: ${this.auth.getStoragePath()}`,
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
        if (error instanceof McpError) {
          throw error;
        }
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
    console.error(`Auth storage: ${this.auth.getStoragePath()}`);
  }
}

const server = new SAPAuthServer();
server.run().catch(console.error);
