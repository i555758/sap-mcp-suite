/**
 * Repository handlers for GitHub MCP server
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textResponse, textError } from "mcp-utils";
import { GitHubApiService } from '../api/github-api.js';
import * as formatter from '../services/formatter-service.js';

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
 * Register repository-related tools
 */
export function registerRepoHandlers(
  server: McpServer,
  getServices: () => Promise<{ api: GitHubApiService }>
): void {
  // Get Current User Tool
  server.registerTool(
    "get_current_user",
    {
      title: "Get Current User",
      description: "Get details of the authenticated GitHub user",
      inputSchema: {}
    },
    async () => {
      try {
        const { api } = await getServices();
        const user = await api.getCurrentUser();
        return textResponse(formatter.formatUser(user));
      } catch (error) {
        return textError(formatError(error, "get current user"));
      }
    }
  );

  // List Repositories Tool
  server.registerTool(
    "list_repositories",
    {
      title: "List Repositories",
      description: "List repositories for the authenticated user",
      inputSchema: {
        visibility: z.enum(['all', 'public', 'private']).optional().describe("Repository visibility"),
        type: z.enum(['all', 'owner', 'public', 'private', 'member']).optional().describe("Repository type"),
        sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().describe("Sort order"),
        direction: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
        per_page: z.number().optional().describe("Number of results per page (max 100)"),
        page: z.number().optional().describe("Page number")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const repositories = await api.listRepositories(args);
        return textResponse(formatter.formatRepositoryList(repositories));
      } catch (error) {
        return textError(formatError(error, "list repositories"));
      }
    }
  );

  // Get Repository Tool
  server.registerTool(
    "get_repository",
    {
      title: "Get Repository",
      description: "Get details of a specific repository including description, default branch, visibility, and more",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const repository = await api.getRepository({
          owner: args.owner,
          repo: args.repo
        });
        return textResponse(formatter.formatRepository(repository));
      } catch (error) {
        return textError(formatError(error, "get repository"));
      }
    }
  );
}
