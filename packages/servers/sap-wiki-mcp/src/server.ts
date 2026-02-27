/**
 * Wiki MCP Server
 * Sets up MCP server and tool registration using the delegated handler pattern.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatAuthError } from "sap-auth";
import { textError, McpResponse } from "mcp-utils";
import { WikiHttpClient } from "./api/wiki-client.js";
import { registerAllHandlers, WikiHandlerContext } from "./handlers/index.js";

/**
 * Wiki MCP Server class
 */
export class WikiServer {
  private server: McpServer;
  private httpClient: WikiHttpClient | null = null;
  private wikiDomain?: string;
  private apiToken?: string;

  constructor(wikiDomain?: string, apiToken?: string) {
    this.wikiDomain = wikiDomain;
    this.apiToken = apiToken;

    this.server = new McpServer({
      name: "sap-wiki-mcp",
      version: "1.2.0",
    });

    this.setupTools();
  }

  /**
   * Get or create the HTTP client singleton
   */
  private async getHttpClient(): Promise<WikiHttpClient> {
    if (!this.httpClient) {
      this.httpClient = new WikiHttpClient(this.wikiDomain, this.apiToken);
      await this.httpClient.initialize();
    }
    return this.httpClient;
  }

  /**
   * Create auth error response wrapper
   */
  private createAuthErrorResponse(): McpResponse {
    // For PAT authentication, return clear error message
    if (this.apiToken) {
      return textError("AUTHENTICATION_ERROR: Invalid or expired API token. Please check your WIKI_API_TOKEN environment variable.");
    }
    return formatAuthError(new Error("AUTHENTICATION_REQUIRED"), "wiki");
  }

  /**
   * Set up tools using delegated handler pattern
   */
  private setupTools(): void {
    const context: WikiHandlerContext = {
      server: this.server,
      getHttpClient: this.getHttpClient.bind(this),
      apiToken: this.apiToken,
      authErrorHandler: this.createAuthErrorResponse.bind(this),
    };

    registerAllHandlers(context);
  }

  /**
   * Run the server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    if (this.wikiDomain && this.apiToken) {
      console.error(
        `Wiki MCP Server running on stdio (Custom domain: ${this.wikiDomain})`
      );
    } else {
      console.error("SAP Wiki MCP Server running on stdio");
    }
  }
}
