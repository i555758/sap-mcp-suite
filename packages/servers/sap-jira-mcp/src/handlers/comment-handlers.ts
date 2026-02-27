/**
 * Comment-related Jira tool handlers
 * Includes: add_comment, delete_comment
 */
import { z } from "zod";
import { HandlerContext } from "./types.js";
import { textResponse } from "mcp-utils";

/**
 * Register comment-related tools
 */
export function registerCommentHandlers(context: HandlerContext): void {
  const {
    server,
    getJiraApiService,
    initializeServices,
  } = context;

  // Add Comment Tool
  server.registerTool(
    "add_comment",
    {
      title: "Add Comment",
      description: "Add a comment to an existing issue",
      inputSchema: {
        issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
        comment: z.string().describe("Comment text to add to the issue"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      await jiraApiService.addComment(args);
      return textResponse(`Comment added to issue ${args.issue_key}`);
    },
  );

  // Delete Comment Tool
  server.registerTool(
    "delete_comment",
    {
      title: "Delete Comment",
      description: "Delete a comment from an existing issue",
      inputSchema: {
        issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
        comment_id: z.string().describe("Comment ID to delete"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      await jiraApiService.deleteComment(args.issue_key, args.comment_id);
      return textResponse(`Comment ${args.comment_id} deleted from issue ${args.issue_key}`);
    },
  );
}
