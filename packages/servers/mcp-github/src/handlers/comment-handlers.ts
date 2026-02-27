/**
 * Comment handlers for GitHub MCP server
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textResponse, textError } from "mcp-utils";
import { GitHubApiService } from '../api/github-api.js';
import {
  formatComment,
  formatCommentReply,
  formatCommentUpdate
} from '../services/formatter-service.js';

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
 * Register comment-related tools
 */
export function registerCommentHandlers(
  server: McpServer,
  getServices: () => Promise<{ api: GitHubApiService }>
): void {
  // Reply to Comment Tool
  server.registerTool(
    "reply_to_comment",
    {
      title: "Reply to Comment",
      description: "Reply to a specific comment (issue comment or review comment)",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        comment_id: z.number().describe("ID of the comment to reply to"),
        body: z.string().describe("Reply content"),
        comment_type: z.enum(['issue', 'review']).optional().describe("Type of comment (default: issue)")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();

        // Get the original comment first
        const originalComment = await api.getComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          comment_type: args.comment_type || 'issue'
        });

        // Create the reply
        const reply = await api.replyToComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          body: args.body,
          comment_type: args.comment_type || 'issue'
        });

        return textResponse(formatCommentReply(reply, originalComment));
      } catch (error) {
        return textError(formatError(error, "reply to comment"));
      }
    }
  );

  // Get Comment Tool
  server.registerTool(
    "get_comment",
    {
      title: "Get Comment",
      description: "Get details of a specific comment (issue comment or review comment)",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        comment_id: z.number().describe("Comment ID"),
        comment_type: z.enum(['issue', 'review']).optional().describe("Type of comment (default: issue)")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const comment = await api.getComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          comment_type: args.comment_type || 'issue'
        });

        return textResponse(formatComment(comment, args.comment_type || 'issue'));
      } catch (error) {
        return textError(formatError(error, "get comment"));
      }
    }
  );

  // Update Comment Tool
  server.registerTool(
    "update_comment",
    {
      title: "Update Comment",
      description: "Update the content of a specific comment (issue comment or review comment)",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        comment_id: z.number().describe("Comment ID"),
        body: z.string().describe("New comment content"),
        comment_type: z.enum(['issue', 'review']).optional().describe("Type of comment (default: issue)")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const comment = await api.updateComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          body: args.body,
          comment_type: args.comment_type || 'issue'
        });

        return textResponse(formatCommentUpdate(comment));
      } catch (error) {
        return textError(formatError(error, "update comment"));
      }
    }
  );

  // Delete Comment Tool
  server.registerTool(
    "delete_comment",
    {
      title: "Delete Comment",
      description: "Delete a specific comment (issue comment or review comment)",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        comment_id: z.number().describe("Comment ID"),
        comment_type: z.enum(['issue', 'review']).optional().describe("Type of comment (default: issue)")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        await api.deleteComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          comment_type: args.comment_type || 'issue'
        });

        return textResponse(`Comment #${args.comment_id} has been successfully deleted.`);
      } catch (error) {
        return textError(formatError(error, "delete comment"));
      }
    }
  );
}
