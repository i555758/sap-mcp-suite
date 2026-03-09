/**
 * GitHub MCP server
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GitHubApiService } from './api/github-api.js';
import { GitHubAuthManager } from './services/auth-manager.js';
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
  private apiService: GitHubApiService;
  private authManager: GitHubAuthManager;

  constructor(apiUrl: string, authManager: GitHubAuthManager) {
    this.authManager = authManager;

    // Create API service with a token getter — credentials are resolved
    // on every request via interceptor, so new PATs work without restart
    this.apiService = new GitHubApiService(
      apiUrl,
      () => authManager.getToken()
    );

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
   * Set up all tools by registering handlers from each domain
   */
  private setupTools(): void {
    const getServices = () => Promise.resolve({ api: this.apiService });

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
