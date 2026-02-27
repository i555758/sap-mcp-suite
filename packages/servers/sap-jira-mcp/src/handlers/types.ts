/**
 * Shared types for Jira handler modules
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JiraApiService } from "../services/api/index.js";
import { FormatterService } from "../services/formatter-service.js";
import { ConfigService } from "../services/config-service.js";
import { AuthManager } from "../services/auth-manager.js";
import { JiraTemplate } from "../types.js";

/**
 * Context object passed to handler registration functions
 */
export interface HandlerContext {
  server: McpServer;
  jiraDomain: string;
  authManager: AuthManager;
  configService: ConfigService;
  getJiraApiService: () => JiraApiService | null;
  getFormatterService: () => FormatterService | null;
  getCurrentProjectKey: () => string | null;
  getTemplates: () => JiraTemplate[] | null;
  getDefaultTemplate: () => JiraTemplate | null;
  initializeServices: () => Promise<void>;
}

/**
 * Helper type for handler registration functions
 */
export type HandlerRegistrationFunction = (context: HandlerContext) => void;
