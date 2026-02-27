/**
 * Meeting handlers for Teams MCP
 *
 * Handles: teams_web_meeting_recordings, teams_web_transcript
 */

import { z } from "zod";
import { jsonResponse, wrapToolHandler } from "mcp-utils";
import { formatAuthError, isAuthError } from "sap-auth";
import type { TeamsApiClient } from "../api/teams-api.js";
import type { TeamsHandlerContext } from "./types.js";

/**
 * Handle teams_web_meeting_recordings
 */
export async function handleMeetingRecordings(
  apiClient: TeamsApiClient,
  args: {
    conversationId: string;
  },
) {
  const { conversationId } = args;

  const recordings = await apiClient.getMeetingRecordings(conversationId);
  return jsonResponse({
    recordings,
    count: recordings.length,
    hasRecordings: recordings.length > 0,
    hint: "Use transcriptUrls with teams_web_transcript tool. SharePoint URLs require different authentication.",
  });
}

/**
 * Handle teams_web_transcript
 */
export async function handleTranscript(
  apiClient: TeamsApiClient,
  args: {
    url: string;
  },
) {
  const { url } = args;

  const result = await apiClient.getTranscript(url);
  return jsonResponse(result);
}

/**
 * Register all meeting-related tools
 */
export function registerMeetingHandlers(context: TeamsHandlerContext): void {
  const { server, apiClient } = context;

  const errorOptions = {
    isAuthError,
    onAuthError: (error: unknown) => formatAuthError(error),
  };

  // teams_web_meeting_recordings tool
  server.registerTool(
    "teams_web_meeting_recordings",
    {
      title: "Teams Web Meeting Recordings",
      description: "Find meeting recordings and transcripts in a conversation. Returns transcriptUrls (Teams AMS URLs that work with current token) and sharepointUrls (need separate auth).",
      inputSchema: {
        conversationId: z.string().describe("Conversation ID (required)"),
      },
    },
    wrapToolHandler(
      (args: { conversationId: string }) =>
        handleMeetingRecordings(apiClient, args),
      errorOptions
    )
  );

  // teams_web_transcript tool
  server.registerTool(
    "teams_web_transcript",
    {
      title: "Teams Web Transcript",
      description: "Fetch meeting transcript content. Use Teams AMS URLs (from transcriptUrls in meeting_recordings result) - these work with the current token. SharePoint URLs will fail due to different auth requirements.",
      inputSchema: {
        url: z.string().describe("Teams AMS transcript URL (e.g., https://eu-prod.asyncgw.teams.microsoft.com/.../views/transcript) (required)"),
      },
    },
    wrapToolHandler(
      (args: { url: string }) =>
        handleTranscript(apiClient, args),
      errorOptions
    )
  );
}
