/**
 * Sprint-related Jira tool handlers
 * Includes: get_issue_sprint_values, get_project_sprint_values, update_issue_sprint
 */
import { z } from "zod";
import { HandlerContext } from "./types.js";
import { jsonResponse } from "mcp-utils";

/**
 * Register sprint-related tools
 */
export function registerSprintHandlers(context: HandlerContext): void {
  const {
    server,
    configService,
    getJiraApiService,
    initializeServices,
  } = context;

  // Get Issue Sprint Values Tool
  server.registerTool(
    "get_issue_sprint_values",
    {
      title: "Get Issue Sprint Values",
      description: "Get sprint values for a specific issue",
      inputSchema: {
        issueKey: z.string().describe("Issue key (e.g., MOB-123)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const sprintValues = await jiraApiService.getIssueSprintValues(args.issueKey);
      return jsonResponse(sprintValues);
    },
  );

  // Get Project Sprint Values Tool
  server.registerTool(
    "get_project_sprint_values",
    {
      title: "Get Project Sprint Values",
      description: "Get sprint values for a specific project.If not provided, defaults to the first project in jira-config.json",
      inputSchema: {
        projectKey: z.string().optional().describe("Project key (e.g., MOB, WRK). If not provided, defaults to the first project in jira-config.json"),
        maxResults: z.number().optional().describe("Maximum number of results to return (default: 50)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const targetProjectKey = args.projectKey || (await configService.loadProjectKey());
      if (!targetProjectKey) {
        throw new Error("Failed to determine project key");
      }

      const sprintValues = await jiraApiService.getProjectSprintValues(targetProjectKey, args.maxResults);
      return jsonResponse(sprintValues);
    },
  );

  // Update Issue Sprint Tool
  server.registerTool(
    "update_issue_sprint",
    {
      title: "Update Issue Sprint",
      description: "Update an issue's sprint using the Agile API. This is the proper way to move issues between sprints.",
      inputSchema: {
        issueKey: z.string().describe("Issue key (e.g., MOB-123)"),
        sprintId: z.number().describe("Target sprint ID (e.g., 327033)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.updateIssueSprint(args.issueKey, args.sprintId);
      return jsonResponse(result);
    },
  );
}
