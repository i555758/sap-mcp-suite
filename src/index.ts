#!/usr/bin/env node
/**
 * SAP MS Teams MCP Server
 *
 * An MCP server that provides access to Microsoft Teams via SAP SSO authentication.
 * Depends on sap-auth-mcp for web-based authentication.
 *
 * Usage:
 * 1. First authenticate using sap-auth-mcp:
 *    sap_authenticate with entry_url="https://teams.cloud.microsoft/v2/"
 * 2. Then use this MCP server's tools to interact with Teams
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as path from "path";
import * as os from "os";

import { TeamsAuthManager } from "./auth.js";
import { TeamsApiClient } from "./api.js";
import { GraphApiClient } from "./graph-api.js";
import { createLogger, isVerbose, getLogFilePath } from "./logger.js";

const log = createLogger("teams-mcp");

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_COOKIE_STORE_PATH = path.join(os.homedir(), ".sap-auth-mcp");
const DEFAULT_REGION = "emea";

// Get configuration from environment variables
const COOKIE_STORE_PATH =
  process.env.AUTH_COOKIE_DIR || DEFAULT_COOKIE_STORE_PATH;
const REGION = (process.env.SAP_TEAMS_REGION || DEFAULT_REGION) as
  | "emea"
  | "amer"
  | "apac";

// ============================================================================
// Tool Definitions
// ============================================================================

const tools: Tool[] = [
  {
    name: "teams_web_conversations",
    description:
      "List recent Microsoft Teams conversations. Can filter by time range or search term.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max conversations to return (default: 20)",
        },
        since: {
          type: "string",
          description:
            "ISO date string - only conversations with activity after this time",
        },
        until: {
          type: "string",
          description:
            "ISO date string - only conversations with activity before this time",
        },
        search: {
          type: "string",
          description:
            "Search term to filter by topic, message content, or members",
        },
      },
    },
  },
  {
    name: "teams_web_messages",
    description:
      "Get messages from a Teams conversation. Can filter by time range or search term.",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "Conversation ID (required)",
        },
        limit: {
          type: "number",
          description: "Max messages (default: 20)",
        },
        since: {
          type: "string",
          description: "ISO date string - only messages after this time",
        },
        until: {
          type: "string",
          description: "ISO date string - only messages before this time",
        },
        search: {
          type: "string",
          description: "Search term to filter messages",
        },
      },
      required: ["conversationId"],
    },
  },
  {
    name: "teams_web_send",
    description: "Send a message to a Teams conversation",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "Conversation ID (required)",
        },
        message: {
          type: "string",
          description: "Message text to send (required)",
        },
      },
      required: ["conversationId", "message"],
    },
  },
  {
    name: "teams_web_search_conversation",
    description:
      "Search for a Teams conversation by name, topic, or participant",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - name, topic, or email (required)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "teams_web_conversations_by_time",
    description:
      "Get all Teams conversations with activity in a specific time range",
    inputSchema: {
      type: "object",
      properties: {
        since: {
          type: "string",
          description: "ISO date string - start of time range (required)",
        },
        until: {
          type: "string",
          description: "ISO date string - end of time range (default: now)",
        },
        limit: {
          type: "number",
          description: "Max conversations (default: 50)",
        },
      },
      required: ["since"],
    },
  },
  {
    name: "teams_web_search_messages",
    description: "Search for specific messages within a Teams conversation",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "Conversation ID (required)",
        },
        query: {
          type: "string",
          description: "Search query (required)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 20)",
        },
      },
      required: ["conversationId", "query"],
    },
  },
  {
    name: "teams_web_meeting_recordings",
    description:
      "Find meeting recordings and transcripts in a conversation. Returns transcriptUrls (Teams AMS URLs that work with current token) and sharepointUrls (need separate auth).",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "Conversation ID (required)",
        },
      },
      required: ["conversationId"],
    },
  },
  {
    name: "teams_web_transcript",
    description:
      "Fetch meeting transcript content. Use Teams AMS URLs (from transcriptUrls in meeting_recordings result) - these work with the current token. SharePoint URLs will fail due to different auth requirements.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "Teams AMS transcript URL (e.g., https://eu-prod.asyncgw.teams.microsoft.com/.../views/transcript) (required)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "teams_web_summarize",
    description:
      "Get conversation messages for summarization. Returns recent messages that can be summarized by the AI.",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "Conversation ID (required)",
        },
        messageCount: {
          type: "number",
          description: "Number of recent messages to include (default: 50)",
        },
        since: {
          type: "string",
          description: "ISO date string - only messages after this time",
        },
      },
      required: ["conversationId"],
    },
  },
  {
    name: "teams_web_find_private_chat",
    description:
      "Find the 1:1 private chat conversation with a specific person. Use this to get the conversation ID before sending a message to someone. Returns only direct private chats, not group chats or meetings.",
    inputSchema: {
      type: "object",
      properties: {
        personName: {
          type: "string",
          description:
            "Name or partial name of the person to find private chat with (required)",
        },
      },
      required: ["personName"],
    },
  },
  {
    name: "teams_web_members",
    description:
      "Get all members of a Teams conversation. Returns member IDs, roles, and display names (when available from recent messages).",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "Conversation ID (required)",
        },
      },
      required: ["conversationId"],
    },
  },
  // ==========================================================================
  // Graph API Tools (People, Calendar, Org Chart)
  // ==========================================================================
  {
    name: "teams_web_search_people",
    description:
      "Search for people by name or email. Returns contact information including email, phone, department, and job title. Requires Graph API token from sap_tokens.json.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - name or email (required)",
        },
        limit: {
          type: "number",
          description: "Max results (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "teams_web_calendar",
    description:
      "Get calendar events for a time range. Supports preset ranges (today, week, month) or custom date range. Requires Graph API token from sap_tokens.json.",
    inputSchema: {
      type: "object",
      properties: {
        range: {
          type: "string",
          description:
            "Preset time range: 'today', 'week', or 'month'. If not specified, use startDate/endDate.",
          enum: ["today", "week", "month"],
        },
        startDate: {
          type: "string",
          description:
            "ISO date string - start of custom time range (use with endDate)",
        },
        endDate: {
          type: "string",
          description:
            "ISO date string - end of custom time range (use with startDate)",
        },
        limit: {
          type: "number",
          description: "Max events (default: 50)",
        },
      },
    },
  },
  {
    name: "teams_web_manager",
    description:
      "Get current user's manager (org chart). Returns manager's profile information. Requires Graph API token from sap_tokens.json.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "teams_web_direct_reports",
    description:
      "Get current user's direct reports (org chart). Returns list of direct reports with their profile information. Requires Graph API token from sap_tokens.json.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Max results (default: 50)",
        },
      },
    },
  },
  {
    name: "teams_web_my_profile",
    description:
      "Get current user's profile information from Microsoft Graph. Requires Graph API token from sap_tokens.json.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ============================================================================
// Server Setup
// ============================================================================

const server = new Server(
  {
    name: "sap-msteams-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Initialize auth manager and API client
const authManager = new TeamsAuthManager(COOKIE_STORE_PATH, REGION);
const apiClient = new TeamsApiClient(authManager);
const graphClient = new GraphApiClient(authManager);

// Helper function to get Graph API unavailable error response
function getGraphUnavailableError() {
  return getSapAuthRequiredError(
    "Graph API token not available in sap_tokens.json",
  );
}

// Helper function to get SAP auth required error response
function getSapAuthRequiredError(reason: string) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: reason,
            hint: `Please authenticate with Teams using sap-auth-mcp: sap_authenticate with entry_url="https://teams.cloud.microsoft/v2/" and store_path="${COOKIE_STORE_PATH}"`,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

// ============================================================================
// Helper function to get typed parameters
// ============================================================================

function getParam<T>(
  args: Record<string, unknown> | undefined,
  key: string,
): T | undefined {
  if (!args) return undefined;
  return args[key] as T | undefined;
}

function getRequiredParam<T>(
  args: Record<string, unknown> | undefined,
  key: string,
): T {
  if (!args || args[key] === undefined) {
    throw new Error(`Missing required parameter: ${key}`);
  }
  return args[key] as T;
}

// ============================================================================
// Tool Handlers
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "teams_web_conversations": {
        const limit = getParam<number>(args, "limit") ?? 20;
        const since = getParam<string>(args, "since");
        const until = getParam<string>(args, "until");
        const search = getParam<string>(args, "search");

        const conversations = await apiClient.getConversations({
          limit,
          since: since ? new Date(since) : undefined,
          until: until ? new Date(until) : undefined,
          search,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { conversations, count: conversations.length },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_messages": {
        const conversationId = getRequiredParam<string>(args, "conversationId");
        const limit = getParam<number>(args, "limit") ?? 20;
        const since = getParam<string>(args, "since");
        const until = getParam<string>(args, "until");
        const search = getParam<string>(args, "search");

        const messages = await apiClient.getMessages(conversationId, {
          limit,
          since: since ? new Date(since) : undefined,
          until: until ? new Date(until) : undefined,
          search,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { messages, count: messages.length },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_send": {
        const conversationId = getRequiredParam<string>(args, "conversationId");
        const message = getRequiredParam<string>(args, "message");

        const result = await apiClient.sendMessage(conversationId, message);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "teams_web_search_conversation": {
        const query = getRequiredParam<string>(args, "query");
        const limit = getParam<number>(args, "limit") ?? 10;

        const conversations = await apiClient.searchConversations(query, limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  conversations,
                  count: conversations.length,
                  query,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_conversations_by_time": {
        const since = getRequiredParam<string>(args, "since");
        const until = getParam<string>(args, "until");
        const limit = getParam<number>(args, "limit") ?? 50;

        const conversations = await apiClient.getConversationsByTime(
          new Date(since),
          until ? new Date(until) : undefined,
          limit,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  conversations,
                  count: conversations.length,
                  timeRange: { since, until: until || "now" },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_search_messages": {
        const conversationId = getRequiredParam<string>(args, "conversationId");
        const query = getRequiredParam<string>(args, "query");
        const limit = getParam<number>(args, "limit") ?? 20;

        const messages = await apiClient.searchMessages(
          conversationId,
          query,
          limit,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  messages,
                  count: messages.length,
                  query,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_meeting_recordings": {
        const conversationId = getRequiredParam<string>(args, "conversationId");

        const recordings = await apiClient.getMeetingRecordings(conversationId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  recordings,
                  count: recordings.length,
                  hasRecordings: recordings.length > 0,
                  hint: "Use transcriptUrls with teams_web_transcript tool. SharePoint URLs require different authentication.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_transcript": {
        const url = getRequiredParam<string>(args, "url");

        const result = await apiClient.getTranscript(url);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "teams_web_summarize": {
        const conversationId = getRequiredParam<string>(args, "conversationId");
        const messageCount = getParam<number>(args, "messageCount") ?? 50;
        const since = getParam<string>(args, "since");

        const result = await apiClient.getMessagesForSummary(
          conversationId,
          messageCount,
          since ? new Date(since) : undefined,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...result,
                  hint: "Use these messages to generate a summary. Look for key decisions, action items, and important discussions.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_find_private_chat": {
        const personName = getRequiredParam<string>(args, "personName");

        const conversation = await apiClient.findPrivateChat(personName);
        if (conversation) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    found: true,
                    conversation,
                    hint: "Use the conversation.id with teams_web_send to send a message to this person.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    found: false,
                    personName,
                    hint: "No 1:1 private chat found with this person. Try using teams_web_search_conversation to find group chats or meetings containing this person.",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      }

      case "teams_web_members": {
        const conversationId = getRequiredParam<string>(args, "conversationId");

        const members = await apiClient.getConversationMembers(conversationId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  members,
                  count: members.length,
                  hint: "Display names are populated from recent message senders. Members who haven't sent messages recently may not have display names.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // ======================================================================
      // Graph API Tools
      // ======================================================================

      case "teams_web_search_people": {
        const query = getRequiredParam<string>(args, "query");
        const limit = getParam<number>(args, "limit") ?? 10;

        if (!graphClient.isAvailable()) {
          return getGraphUnavailableError();
        }

        const people = await graphClient.searchPeople(query, limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  people,
                  count: people.length,
                  query,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_calendar": {
        const range = getParam<string>(args, "range");
        const startDate = getParam<string>(args, "startDate");
        const endDate = getParam<string>(args, "endDate");
        const limit = getParam<number>(args, "limit") ?? 50;

        if (!graphClient.isAvailable()) {
          return getGraphUnavailableError();
        }

        let events;
        let timeRangeDesc: string;

        if (range === "today") {
          events = await graphClient.getTodayEvents(limit);
          timeRangeDesc = "today";
        } else if (range === "week") {
          events = await graphClient.getWeekEvents(limit);
          timeRangeDesc = "this week (next 7 days)";
        } else if (range === "month") {
          events = await graphClient.getMonthEvents(limit);
          timeRangeDesc = "this month (next 30 days)";
        } else if (startDate && endDate) {
          events = await graphClient.getCalendarEvents(
            new Date(startDate),
            new Date(endDate),
            limit,
          );
          timeRangeDesc = `${startDate} to ${endDate}`;
        } else {
          // Default to this week
          events = await graphClient.getWeekEvents(limit);
          timeRangeDesc = "this week (default)";
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  events,
                  count: events.length,
                  timeRange: timeRangeDesc,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_manager": {
        if (!graphClient.isAvailable()) {
          return getGraphUnavailableError();
        }

        const manager = await graphClient.getManager();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  manager,
                  hasManager: manager !== null,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_direct_reports": {
        const limit = getParam<number>(args, "limit") ?? 50;

        if (!graphClient.isAvailable()) {
          return getGraphUnavailableError();
        }

        const directReports = await graphClient.getDirectReports(limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  directReports,
                  count: directReports.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case "teams_web_my_profile": {
        if (!graphClient.isAvailable()) {
          return getGraphUnavailableError();
        }

        const profile = await graphClient.getMe();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ profile }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if this is an authentication-related error
    if (
      errorMessage.includes("authenticate") ||
      errorMessage.includes("token") ||
      errorMessage.includes("SAP auth")
    ) {
      return getSapAuthRequiredError(errorMessage);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log.info("Server started");
  log.info(`Cookie store path: ${COOKIE_STORE_PATH}`);
  log.info(`Region: ${REGION}`);

  if (isVerbose()) {
    log.info(`Verbose mode enabled, logging to: ${getLogFilePath()}`);
  }
}

main().catch((error) => {
  log.error("Fatal error:", error);
  process.exit(1);
});
