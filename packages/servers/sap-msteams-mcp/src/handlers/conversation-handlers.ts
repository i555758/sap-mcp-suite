/**
 * Conversation handlers for Teams MCP
 *
 * Handles: teams_web_conversations, teams_web_messages, teams_web_find_private_chat, teams_web_members
 */

import { z } from "zod";
import { jsonResponse, wrapToolHandler } from "mcp-utils";
import { formatAuthError, isAuthError } from "sap-auth";
import type { TeamsApiClient } from "../api/teams-api.js";
import type { TeamsHandlerContext } from "./types.js";

/**
 * Handle teams_web_conversations
 * Unified handler for listing, searching, and filtering conversations
 */
export async function handleConversations(
  apiClient: TeamsApiClient,
  args: {
    limit?: number;
    since?: string;
    until?: string;
    search?: string;
  },
) {
  const { limit = 20, since, until, search } = args;

  // If search is provided, use the enhanced search that resolves private chat names
  if (search) {
    const conversations = await apiClient.searchConversations(search, limit);
    return jsonResponse({
      conversations,
      count: conversations.length,
      query: search,
    });
  }

  // Otherwise, get conversations with optional time filtering
  const conversations = await apiClient.getConversations({
    limit,
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
  });
  return jsonResponse({ conversations, count: conversations.length });
}

/**
 * Handle teams_web_messages
 * Unified handler for getting messages with optional search/filtering
 */
export async function handleMessages(
  apiClient: TeamsApiClient,
  args: {
    conversationId: string;
    limit?: number;
    since?: string;
    until?: string;
    search?: string;
  },
) {
  const { conversationId, limit = 20, since, until, search } = args;

  const messages = await apiClient.getMessages(conversationId, {
    limit,
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
    search,
  });
  return jsonResponse({ messages, count: messages.length });
}

/**
 * Handle teams_web_find_private_chat
 */
export async function handleFindPrivateChat(
  apiClient: TeamsApiClient,
  args: {
    query: string;
  },
) {
  const { query } = args;

  const result = await apiClient.findPrivateChat(query);

  switch (result.status) {
    case "found":
      return jsonResponse({
        found: true,
        conversation: result.conversation,
        hint: "Use the conversation.id with teams_web_send to send a message to this person.",
      });

    case "not_found":
      return jsonResponse({
        found: false,
        query,
        message: result.message,
        hint: "No user found matching this name.",
      });

    case "no_chat":
      return jsonResponse({
        found: false,
        query,
        message: result.message,
        user: result.candidates?.[0],
        hint: "User exists but no private chat history. You can start a new conversation with them.",
      });

    case "ambiguous":
      return jsonResponse({
        found: false,
        query,
        message: result.message,
        candidates: result.candidates,
        hint: "Multiple matches found. Please ask the user to select one and then call teams_web_send with the conversationId directly, or call this tool again with a more specific name.",
      });

    default:
      return jsonResponse({
        found: false,
        query,
        hint: "No 1:1 private chat found with this person.",
      });
  }
}

/**
 * Handle teams_web_members
 */
export async function handleMembers(
  apiClient: TeamsApiClient,
  args: {
    conversationId: string;
  },
) {
  const { conversationId } = args;

  const members = await apiClient.getConversationMembers(conversationId);
  return jsonResponse({
    members,
    count: members.length,
  });
}

/**
 * Register all conversation-related tools
 */
export function registerConversationHandlers(context: TeamsHandlerContext): void {
  const { server, apiClient } = context;

  const errorOptions = {
    isAuthError,
    onAuthError: (error: unknown) => formatAuthError(error),
  };

  // teams_web_conversations - unified conversation listing and search
  server.registerTool(
    "teams_web_conversations",
    {
      title: "Teams Conversations",
      description:
        "List or search Teams conversations. Use 'search' to find conversations by name, topic, or participant (including private chats). Use 'since'/'until' to filter by time range.",
      inputSchema: {
        limit: z.number().optional().describe("Max conversations to return (default: 20)"),
        since: z.string().optional().describe("ISO date string - only conversations with activity after this time"),
        until: z.string().optional().describe("ISO date string - only conversations with activity before this time"),
        search: z.string().optional().describe("Search query - finds conversations by topic, participant name, or message content."),
      },
    },
    wrapToolHandler(
      (args: { limit?: number; since?: string; until?: string; search?: string }) =>
        handleConversations(apiClient, args),
      errorOptions
    )
  );

  // teams_web_messages - unified message listing and search
  server.registerTool(
    "teams_web_messages",
    {
      title: "Teams Messages",
      description: "Get messages from a Teams conversation. Use 'search' to filter messages, 'since'/'until' for time range. For summarization, set limit=50 or higher.",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID (required)"),
        limit: z.number().optional().describe("Max messages (default: 20, use 50+ for summarization)"),
        since: z.string().optional().describe("ISO date string - only messages after this time"),
        until: z.string().optional().describe("ISO date string - only messages before this time"),
        search: z.string().optional().describe("Search term to filter messages"),
      },
    },
    wrapToolHandler(
      (args: { conversationId: string; limit?: number; since?: string; until?: string; search?: string }) =>
        handleMessages(apiClient, args),
      errorOptions
    )
  );

  // teams_web_find_private_chat - find 1:1 private chat
  server.registerTool(
    "teams_web_find_private_chat",
    {
      title: "Find Private Chat",
      description: "Find the 1:1 private chat with a specific person. Returns only direct private chats, not group chats or meetings. Use this to get the conversation ID before sending a direct message.",
      inputSchema: {
        query: z.string().describe("Name, partial name, or email of the person (required)."),
      },
    },
    wrapToolHandler(
      (args: { query: string }) =>
        handleFindPrivateChat(apiClient, args),
      errorOptions
    )
  );

  // teams_web_members - get conversation members
  server.registerTool(
    "teams_web_members",
    {
      title: "Teams Members",
      description: "Get all members of a Teams conversation with their roles.",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID (required)"),
      },
    },
    wrapToolHandler(
      (args: { conversationId: string }) =>
        handleMembers(apiClient, args),
      errorOptions
    )
  );
}
