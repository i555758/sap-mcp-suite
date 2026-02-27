/**
 * Conversation handlers for Teams MCP
 *
 * Handles: teams_web_conversations, teams_web_messages, teams_web_search_conversation,
 * teams_web_conversations_by_time, teams_web_search_messages, teams_web_summarize,
 * teams_web_find_private_chat, teams_web_members
 */

import { z } from "zod";
import { jsonResponse, wrapToolHandler } from "mcp-utils";
import { formatAuthError, isAuthError } from "sap-auth";
import type { TeamsApiClient } from "../api/teams-api.js";
import type { TeamsHandlerContext } from "./types.js";

/**
 * Handle teams_web_conversations
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

  const conversations = await apiClient.getConversations({
    limit,
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
    search,
  });
  return jsonResponse({ conversations, count: conversations.length });
}

/**
 * Handle teams_web_messages
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
 * Handle teams_web_search_conversation
 */
export async function handleSearchConversation(
  apiClient: TeamsApiClient,
  args: {
    query: string;
    limit?: number;
  },
) {
  const { query, limit = 10 } = args;

  const conversations = await apiClient.searchConversations(query, limit);
  return jsonResponse({
    conversations,
    count: conversations.length,
    query,
  });
}

/**
 * Handle teams_web_conversations_by_time
 */
export async function handleConversationsByTime(
  apiClient: TeamsApiClient,
  args: {
    since: string;
    until?: string;
    limit?: number;
  },
) {
  const { since, until, limit = 50 } = args;

  const conversations = await apiClient.getConversationsByTime(
    new Date(since),
    until ? new Date(until) : undefined,
    limit,
  );
  return jsonResponse({
    conversations,
    count: conversations.length,
    timeRange: { since, until: until || "now" },
  });
}

/**
 * Handle teams_web_search_messages
 */
export async function handleSearchMessages(
  apiClient: TeamsApiClient,
  args: {
    conversationId: string;
    query: string;
    limit?: number;
  },
) {
  const { conversationId, query, limit = 20 } = args;

  const messages = await apiClient.searchMessages(
    conversationId,
    query,
    limit,
  );
  return jsonResponse({
    messages,
    count: messages.length,
    query,
  });
}

/**
 * Handle teams_web_summarize
 */
export async function handleSummarize(
  apiClient: TeamsApiClient,
  args: {
    conversationId: string;
    messageCount?: number;
    since?: string;
  },
) {
  const { conversationId, messageCount = 50, since } = args;

  const result = await apiClient.getMessagesForSummary(
    conversationId,
    messageCount,
    since ? new Date(since) : undefined,
  );
  return jsonResponse({
    ...result,
    hint: "Use these messages to generate a summary. Look for key decisions, action items, and important discussions.",
  });
}

/**
 * Handle teams_web_find_private_chat
 */
export async function handleFindPrivateChat(
  apiClient: TeamsApiClient,
  args: {
    personName: string;
  },
) {
  const { personName } = args;

  const conversation = await apiClient.findPrivateChat(personName);
  if (conversation) {
    return jsonResponse({
      found: true,
      conversation,
      hint: "Use the conversation.id with teams_web_send to send a message to this person.",
    });
  } else {
    return jsonResponse({
      found: false,
      personName,
      hint: "No 1:1 private chat found with this person. Try using teams_web_search_conversation to find group chats or meetings containing this person.",
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
    hint: "Display names are populated from recent message senders. Members who haven't sent messages recently may not have display names.",
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

  // teams_web_conversations tool
  server.registerTool(
    "teams_web_conversations",
    {
      title: "Teams Web Conversations",
      description:
        "List recent Microsoft Teams conversations. Can filter by time range or search term.",
      inputSchema: {
        limit: z.number().optional().describe("Max conversations to return (default: 20)"),
        since: z.string().optional().describe("ISO date string - only conversations with activity after this time"),
        until: z.string().optional().describe("ISO date string - only conversations with activity before this time"),
        search: z.string().optional().describe("Search term to filter by topic, message content, or members"),
      },
    },
    wrapToolHandler(
      (args: { limit?: number; since?: string; until?: string; search?: string }) =>
        handleConversations(apiClient, args),
      errorOptions
    )
  );

  // teams_web_messages tool
  server.registerTool(
    "teams_web_messages",
    {
      title: "Teams Web Messages",
      description: "Get messages from a Teams conversation. Can filter by time range or search term.",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID (required)"),
        limit: z.number().optional().describe("Max messages (default: 20)"),
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

  // teams_web_search_conversation tool
  server.registerTool(
    "teams_web_search_conversation",
    {
      title: "Teams Web Search Conversation",
      description: "Search for a Teams conversation by name, topic, or participant",
      inputSchema: {
        query: z.string().describe("Search query - name, topic, or email (required)"),
        limit: z.number().optional().describe("Max results (default: 10)"),
      },
    },
    wrapToolHandler(
      (args: { query: string; limit?: number }) =>
        handleSearchConversation(apiClient, args),
      errorOptions
    )
  );

  // teams_web_conversations_by_time tool
  server.registerTool(
    "teams_web_conversations_by_time",
    {
      title: "Teams Web Conversations By Time",
      description: "Get all Teams conversations with activity in a specific time range",
      inputSchema: {
        since: z.string().describe("ISO date string - start of time range (required)"),
        until: z.string().optional().describe("ISO date string - end of time range (default: now)"),
        limit: z.number().optional().describe("Max conversations (default: 50)"),
      },
    },
    wrapToolHandler(
      (args: { since: string; until?: string; limit?: number }) =>
        handleConversationsByTime(apiClient, args),
      errorOptions
    )
  );

  // teams_web_search_messages tool
  server.registerTool(
    "teams_web_search_messages",
    {
      title: "Teams Web Search Messages",
      description: "Search for specific messages within a Teams conversation",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID (required)"),
        query: z.string().describe("Search query (required)"),
        limit: z.number().optional().describe("Max results (default: 20)"),
      },
    },
    wrapToolHandler(
      (args: { conversationId: string; query: string; limit?: number }) =>
        handleSearchMessages(apiClient, args),
      errorOptions
    )
  );

  // teams_web_summarize tool
  server.registerTool(
    "teams_web_summarize",
    {
      title: "Teams Web Summarize",
      description: "Get conversation messages for summarization. Returns recent messages that can be summarized by the AI.",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID (required)"),
        messageCount: z.number().optional().describe("Number of recent messages to include (default: 50)"),
        since: z.string().optional().describe("ISO date string - only messages after this time"),
      },
    },
    wrapToolHandler(
      (args: { conversationId: string; messageCount?: number; since?: string }) =>
        handleSummarize(apiClient, args),
      errorOptions
    )
  );

  // teams_web_find_private_chat tool
  server.registerTool(
    "teams_web_find_private_chat",
    {
      title: "Teams Web Find Private Chat",
      description: "Find the 1:1 private chat conversation with a specific person. Use this to get the conversation ID before sending a message to someone. Returns only direct private chats, not group chats or meetings.",
      inputSchema: {
        personName: z.string().describe("Name or partial name of the person to find private chat with (required)"),
      },
    },
    wrapToolHandler(
      (args: { personName: string }) =>
        handleFindPrivateChat(apiClient, args),
      errorOptions
    )
  );

  // teams_web_members tool
  server.registerTool(
    "teams_web_members",
    {
      title: "Teams Web Members",
      description: "Get all members of a Teams conversation. Returns member IDs, roles, and display names (when available from recent messages).",
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
