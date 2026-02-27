/**
 * Jira MCP server
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { JiraApiService } from "./api/index.js";
import { FormatterService } from "./formatter-service.js";
import { ConfigService } from "./config-service.js";
import { AuthManager } from "./auth-manager.js";
import { JiraTemplate } from "../types.js";
import { registerAllHandlers, HandlerContext } from "../handlers/index.js";

import { logger } from "../utils/logger.js";

/**
 * Jira server class
 */
export class JiraServer {
  private server: McpServer;
  private jiraApiService: JiraApiService | null = null;
  private formatterService: FormatterService | null = null;
  private configService: ConfigService;
  private currentProjectKey: string | null = null;
  private templates: JiraTemplate[] | null = null;
  private defaultTemplate: JiraTemplate | null = null;
  private authManager: AuthManager;
  private jiraDomain: string;

  /**
   * Constructor - accepts AuthManager for centralized authentication
   * @param authManager Authentication manager instance
   * @param jiraDomain jira system domain string
   * @param configPath Path to configuration file
   */
  constructor(
    authManager: AuthManager,
    jiraDomain: string,
    configPath: string,
  ) {
    this.authManager = authManager;
    this.jiraDomain = jiraDomain;
    this.configService = new ConfigService(configPath);

    this.server = new McpServer({
      name: "sap-jira-mcp",
      version: "2.0.0",
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
    if (!this.currentProjectKey || !this.templates || !this.defaultTemplate) {
      logger.info("[initializeServices] Starting service initialization");
      // Load the project key (defaults to the first project in the array if not specified)
      this.currentProjectKey = await this.configService.loadProjectKey();
      if (!this.currentProjectKey) {
        throw new Error("Failed to load project key from configuration");
      }

      // Load templates for the project (defaults to the first project in the array if not specified)
      this.templates = await this.configService.loadCreateIssueTemplates();
      if (!this.templates || this.templates.length === 0) {
        throw new Error("Failed to load templates from configuration");
      }

      // Get the default template (defaults to the first template in the array)
      this.defaultTemplate = await this.configService.getDefaultTemplate();
      if (!this.defaultTemplate) {
        throw new Error("Failed to load default template from configuration");
      }

      this.jiraApiService = new JiraApiService(
        this.jiraDomain,
        this.currentProjectKey,
        this.templates,
        this.configService,
        this.authManager,
      );

      await this.jiraApiService.initialize();

      this.formatterService = new FormatterService(
        this.jiraDomain,
        this.configService,
      );

      logger.info("[initializeServices] Service initialization completed");
    } else {
      logger.debug(
        "[initializeServices] Services already initialized, skipping",
      );
    }
  }

  /**
   * Set up all tools using handlers
   */
  private setupTools(): void {
    const context: HandlerContext = {
      server: this.server,
      jiraDomain: this.jiraDomain,
      authManager: this.authManager,
      configService: this.configService,
      getJiraApiService: () => this.jiraApiService,
      getFormatterService: () => this.formatterService,
      getCurrentProjectKey: () => this.currentProjectKey,
      getTemplates: () => this.templates,
      getDefaultTemplate: () => this.defaultTemplate,
      initializeServices: () => this.initializeServices(),
    };

    registerAllHandlers(context);
  }

  /**
   * Run the server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("Jira MCP server running on stdio");
  }
}
