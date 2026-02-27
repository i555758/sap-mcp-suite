/**
 * Transition-related Jira tool handlers
 * Includes: get_transitions, update_transition
 */
import { z } from "zod";
import { HandlerContext } from "./types.js";
import { jsonResponse } from "mcp-utils";

/**
 * Register transition-related tools
 */
export function registerTransitionHandlers(context: HandlerContext): void {
  const {
    server,
    getJiraApiService,
    initializeServices,
  } = context;

  // Get Transitions Tool
  server.registerTool(
    "get_transitions",
    {
      title: "Get Transitions",
      description: "Get available transitions (status changes) for a Jira issue",
      inputSchema: {
        issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const transitions = await jiraApiService.getTransitions(args);
      return jsonResponse(transitions);
    },
  );

  // Update Transition Tool
  server.registerTool(
    "update_transition",
    {
      title: "Update Transition",
      description: "Update the transition (change status) of a Jira issue. Use get_transitions first to get available transition IDs.",
      inputSchema: {
        issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
        transition_id: z.string().describe("Transition ID obtained from get_transitions tool"),
        comment: z.string().optional().describe("Optional comment to add when transitioning"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.updateTransition(args);
      return jsonResponse(result);
    },
  );
}
