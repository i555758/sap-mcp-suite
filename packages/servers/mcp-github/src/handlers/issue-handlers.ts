/**
 * Issue handlers for GitHub MCP server
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textResponse, textError } from "mcp-utils";
import { GitHubApiService } from '../api/github-api.js';
import { formatIssue } from '../services/formatter-service.js';

/**
 * Format error message for user-friendly display
 */
function formatError(error: unknown, operation: string): string {
  if (error instanceof Error) {
    const axiosError = error as any;
    if (axiosError.response?.data?.message) {
      return `Failed to ${operation}: ${axiosError.response.data.message}`;
    }
    if (axiosError.response?.status) {
      const status = axiosError.response.status;
      if (status === 401) {
        return `Failed to ${operation}: Authentication failed. Please check your GitHub token.`;
      }
      if (status === 403) {
        return `Failed to ${operation}: Access forbidden. You may not have permission for this action.`;
      }
      if (status === 404) {
        return `Failed to ${operation}: Resource not found.`;
      }
      if (status === 422) {
        return `Failed to ${operation}: Invalid request parameters.`;
      }
      return `Failed to ${operation}: HTTP ${status} error.`;
    }
    return `Failed to ${operation}: ${error.message}`;
  }
  return `Failed to ${operation}: An unexpected error occurred.`;
}

/**
 * Register issue-related tools
 */
export function registerIssueHandlers(
  server: McpServer,
  getServices: () => Promise<{ api: GitHubApiService }>
): void {
  // Create Issue Tool
  server.registerTool(
    "create_issue",
    {
      title: "Create Issue",
      description: "Create a new issue",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Issue title"),
        body: z.string().optional().describe("Issue body"),
        assignees: z.array(z.string()).optional().describe("List of assignees"),
        labels: z.array(z.string()).optional().describe("List of labels"),
        milestone: z.number().optional().describe("Milestone number")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const issue = await api.createIssue(args);
        return textResponse(formatIssue(issue));
      } catch (error) {
        return textError(formatError(error, "create issue"));
      }
    }
  );
}
