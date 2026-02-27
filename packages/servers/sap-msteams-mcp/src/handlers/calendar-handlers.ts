/**
 * Calendar handlers for Teams MCP
 *
 * Handles: teams_web_calendar
 */

import { z } from "zod";
import { jsonResponse, wrapToolHandler } from "mcp-utils";
import { formatAuthError, isAuthError } from "sap-auth";
import type { GraphApiClient } from "../api/graph-api.js";
import type { TeamsHandlerContext } from "./types.js";

/**
 * Handle teams_web_calendar
 */
export async function handleCalendar(
  graphClient: GraphApiClient,
  args: {
    range?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  },
) {
  const { range, startDate, endDate, limit = 50 } = args;

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

  return jsonResponse({
    events,
    count: events.length,
    timeRange: timeRangeDesc,
  });
}

/**
 * Register all calendar-related tools
 */
export function registerCalendarHandlers(context: TeamsHandlerContext): void {
  const { server, graphClient } = context;

  const errorOptions = {
    isAuthError,
    onAuthError: (error: unknown) => formatAuthError(error),
  };

  // teams_web_calendar tool
  server.registerTool(
    "teams_web_calendar",
    {
      title: "Teams Web Calendar",
      description: "Get calendar events for a time range. Supports preset ranges (today, week, month) or custom date range. Requires Graph API token.",
      inputSchema: {
        range: z.enum(["today", "week", "month"]).optional().describe("Preset time range: 'today', 'week', or 'month'. If not specified, use startDate/endDate."),
        startDate: z.string().optional().describe("ISO date string - start of custom time range (use with endDate)"),
        endDate: z.string().optional().describe("ISO date string - end of custom time range (use with startDate)"),
        limit: z.number().optional().describe("Max events (default: 50)"),
      },
    },
    wrapToolHandler(
      (args: { range?: "today" | "week" | "month"; startDate?: string; endDate?: string; limit?: number }) =>
        handleCalendar(graphClient, args),
      errorOptions
    )
  );
}
