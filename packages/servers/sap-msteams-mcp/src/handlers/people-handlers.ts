/**
 * People handlers for Teams MCP
 *
 * Handles: teams_web_search_people, teams_web_manager, teams_web_direct_reports, teams_web_my_profile
 */

import { z } from "zod";
import { jsonResponse, wrapToolHandler } from "mcp-utils";
import { formatAuthError, isAuthError } from "sap-auth";
import type { GraphApiClient } from "../api/graph-api.js";
import type { TeamsHandlerContext } from "./types.js";

/**
 * Handle teams_web_search_people
 */
export async function handleSearchPeople(
  graphClient: GraphApiClient,
  args: {
    query: string;
    limit?: number;
  },
) {
  const { query, limit = 10 } = args;

  const people = await graphClient.searchPeople(query, limit);
  return jsonResponse({
    people,
    count: people.length,
    query,
  });
}

/**
 * Handle teams_web_manager
 */
export async function handleManager(graphClient: GraphApiClient) {
  const manager = await graphClient.getManager();
  return jsonResponse({
    manager,
    hasManager: manager !== null,
  });
}

/**
 * Handle teams_web_direct_reports
 */
export async function handleDirectReports(
  graphClient: GraphApiClient,
  args: {
    limit?: number;
  },
) {
  const { limit = 50 } = args;

  const directReports = await graphClient.getDirectReports(limit);
  return jsonResponse({
    directReports,
    count: directReports.length,
  });
}

/**
 * Handle teams_web_my_profile
 */
export async function handleMyProfile(graphClient: GraphApiClient) {
  const profile = await graphClient.getMe();
  return jsonResponse({ profile });
}

/**
 * Register all people-related tools
 */
export function registerPeopleHandlers(context: TeamsHandlerContext): void {
  const { server, graphClient } = context;

  const errorOptions = {
    isAuthError,
    onAuthError: (error: unknown) => formatAuthError(error),
  };

  // teams_web_search_people tool
  server.registerTool(
    "teams_web_search_people",
    {
      title: "Teams Web Search People",
      description: "Search for people by name or email. Returns contact information including email, phone, department, and job title. Requires Graph API token.",
      inputSchema: {
        query: z.string().describe("Search query - name or email (required)"),
        limit: z.number().optional().describe("Max results (default: 10)"),
      },
    },
    wrapToolHandler(
      (args: { query: string; limit?: number }) =>
        handleSearchPeople(graphClient, args),
      errorOptions
    )
  );

  // teams_web_manager tool
  server.registerTool(
    "teams_web_manager",
    {
      title: "Teams Web Manager",
      description: "Get current user's manager (org chart). Returns manager's profile information. Requires Graph API token.",
      inputSchema: {},
    },
    wrapToolHandler(
      () => handleManager(graphClient),
      errorOptions
    )
  );

  // teams_web_direct_reports tool
  server.registerTool(
    "teams_web_direct_reports",
    {
      title: "Teams Web Direct Reports",
      description: "Get current user's direct reports (org chart). Returns list of direct reports with their profile information. Requires Graph API token.",
      inputSchema: {
        limit: z.number().optional().describe("Max results (default: 50)"),
      },
    },
    wrapToolHandler(
      (args: { limit?: number }) =>
        handleDirectReports(graphClient, args),
      errorOptions
    )
  );

  // teams_web_my_profile tool
  server.registerTool(
    "teams_web_my_profile",
    {
      title: "Teams Web My Profile",
      description: "Get current user's profile information from Microsoft Graph. Requires Graph API token.",
      inputSchema: {},
    },
    wrapToolHandler(
      () => handleMyProfile(graphClient),
      errorOptions
    )
  );
}
