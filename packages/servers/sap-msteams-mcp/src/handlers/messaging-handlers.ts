/**
 * Messaging handlers for Teams MCP
 *
 * Handles: teams_web_send, teams_web_reply
 */

import { z } from "zod";
import { jsonResponse, wrapToolHandler } from "mcp-utils";
import { formatAuthError, isAuthError } from "sap-auth";
import type { TeamsApiClient, MessageFormat } from "../api/teams-api.js";
import type { TeamsHandlerContext } from "./types.js";

/**
 * Handle teams_web_send
 */
export async function handleSend(
  apiClient: TeamsApiClient,
  args: {
    conversationId: string;
    message: string;
    format?: MessageFormat;
  },
) {
  const { conversationId, message, format = "html" } = args;

  const result = await apiClient.sendMessage(conversationId, message, format);
  return jsonResponse(result);
}

/**
 * Handle teams_web_reply
 */
export async function handleReply(
  apiClient: TeamsApiClient,
  args: {
    conversationId: string;
    parentMessageId: string;
    message: string;
    format?: MessageFormat;
  },
) {
  const { conversationId, parentMessageId, message, format = "html" } = args;

  const result = await apiClient.sendReply(
    conversationId,
    parentMessageId,
    message,
    format,
  );
  return jsonResponse(result);
}

/**
 * Register all messaging-related tools
 */
export function registerMessagingHandlers(context: TeamsHandlerContext): void {
  const { server, apiClient } = context;

  const errorOptions = {
    isAuthError,
    onAuthError: (error: unknown) => formatAuthError(error),
  };

  // teams_web_send tool
  server.registerTool(
    "teams_web_send",
    {
      title: "Teams Web Send",
      description: "Send a message to a Teams conversation (creates a new top-level message, not a threaded reply). For threaded replies, use teams_web_reply instead.",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID (required)"),
        message: z.string().describe("Message content to send (required)"),
        format: z.enum(["html", "markdown"]).optional().describe("Message format: 'html' (default, rich formatting with <b>, <i>, <ul>, etc.), 'markdown' (Teams markdown syntax)"),
      },
    },
    wrapToolHandler(
      (args: { conversationId: string; message: string; format?: MessageFormat }) =>
        handleSend(apiClient, args),
      errorOptions
    )
  );

  // teams_web_reply tool
  server.registerTool(
    "teams_web_reply",
    {
      title: "Teams Web Reply",
      description: "Send a threaded reply to a specific message in a Teams channel. The reply will appear under the parent message in the thread.",
      inputSchema: {
        conversationId: z.string().describe("Channel/Conversation ID (e.g., 19:xxx@thread.tacv2) (required)"),
        parentMessageId: z.string().describe("ID of the message to reply to (required)"),
        message: z.string().describe("Message text to send as reply (required)"),
        format: z.enum(["html", "markdown"]).optional().describe("Message format: 'html' (default, rich formatting with <b>, <i>, <ul>, etc.), 'markdown' (Teams markdown syntax)"),
      },
    },
    wrapToolHandler(
      (args: { conversationId: string; parentMessageId: string; message: string; format?: MessageFormat }) =>
        handleReply(apiClient, args),
      errorOptions
    )
  );
}
