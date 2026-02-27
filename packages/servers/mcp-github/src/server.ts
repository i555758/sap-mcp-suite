/**
 * GitHub MCP server
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GitHubApiService } from './api/github-api.js';
import {
  registerRepoHandlers,
  registerIssueHandlers,
  registerPrHandlers,
  registerCommentHandlers
} from './handlers/index.js';

/**
 * GitHub server class
 */
export class GitHubServer {
  private server: McpServer;
  private apiService: GitHubApiService | null = null;
  private apiUrl: string;
  private token: string;

  /**
   * Constructor
   * @param apiUrl GitHub API URL
   * @param token GitHub API token
   */
  constructor(apiUrl: string, token: string) {
    this.apiUrl = apiUrl;
    this.token = token;

    this.server = new McpServer({
      name: "mcp-github",
      version: "1.0.0",
    });

    this.setupTools();

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Initialize services
   */
  private async initializeServices(): Promise<void> {
    if (!this.apiService) {
      this.apiService = new GitHubApiService(
        this.apiUrl,
        this.token
      );
    }
  }

  /**
   * Ensure services are initialized and return them
   */
  private async ensureServices(): Promise<{ api: GitHubApiService }> {
    await this.initializeServices();
    if (!this.apiService) {
      throw new Error("Services not initialized");
    }
    return { api: this.apiService };
  }

  /**
   * Set up all tools by registering handlers from each domain
   */
  private setupTools(): void {
    const getServices = () => this.ensureServices();

    // Register handlers by domain
    registerRepoHandlers(this.server, getServices);
    registerIssueHandlers(this.server, getServices);
    registerPrHandlers(this.server, getServices);
    registerCommentHandlers(this.server, getServices);
  }

  /**
   * Run the server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub MCP server running on stdio");
  }
}
