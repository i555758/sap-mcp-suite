/**
 * Board-related Jira tool handlers
 * Includes: get_boards, get_board, get_board_configuration, get_board_issues,
 *           get_board_sprints, get_board_active_sprint, get_my_board_issues
 */
import { z } from "zod";
import { HandlerContext } from "./types.js";
import { jsonResponse } from "mcp-utils";

/**
 * Register board-related tools
 */
export function registerBoardHandlers(context: HandlerContext): void {
  const {
    server,
    configService,
    getJiraApiService,
    initializeServices,
  } = context;

  // Get Boards Tool
  server.registerTool(
    "get_boards",
    {
      title: "Get Boards",
      description:
        "Get all boards visible to the user. Can be filtered by project key or board type (scrum/kanban).",
      inputSchema: {
        projectKeyOrId: z
          .string()
          .optional()
          .describe(
            "Optional project key or ID to filter boards (e.g., MOB, WRK)",
          ),
        boardType: z
          .string()
          .optional()
          .describe(
            'Optional board type to filter (e.g., "scrum", "kanban")',
          ),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return (default: 50)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.getBoards(
        args.projectKeyOrId,
        args.boardType,
        args.maxResults,
      );
      return jsonResponse(result);
    },
  );

  // Get Board Tool
  server.registerTool(
    "get_board",
    {
      title: "Get Board",
      description: "Get detailed information about a specific board by ID.",
      inputSchema: {
        boardId: z.number().describe("Board ID"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.getBoard(String(args.boardId));
      return jsonResponse(result);
    },
  );

  // Get Board Configuration Tool
  server.registerTool(
    "get_board_configuration",
    {
      title: "Get Board Configuration",
      description:
        "Get board configuration including columns, swimlanes, card layout, and other settings.",
      inputSchema: {
        boardId: z.number().describe("Board ID"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.getBoardConfiguration(
        String(args.boardId),
      );
      return jsonResponse(result);
    },
  );

  // Get Board Issues Tool
  server.registerTool(
    "get_board_issues",
    {
      title: "Get Board Issues",
      description:
        "Get all issues on a specific board. Can be further filtered with JQL.",
      inputSchema: {
        boardId: z.number().describe("Board ID"),
        jql: z
          .string()
          .optional()
          .describe("Optional additional JQL to filter issues"),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return (default: 50)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.getBoardIssues(
        String(args.boardId),
        args.jql,
        args.maxResults,
      );
      return jsonResponse(result);
    },
  );

  // Get Board Sprints Tool
  server.registerTool(
    "get_board_sprints",
    {
      title: "Get Board Sprints",
      description:
        "Get all sprints for a specific board. Can filter by state (active, closed, future).",
      inputSchema: {
        boardId: z.number().describe("Board ID"),
        state: z
          .string()
          .optional()
          .describe(
            'Optional state filter: "active", "closed", or "future"',
          ),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return (default: 50)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.getBoardSprints(
        String(args.boardId),
        args.state,
        args.maxResults,
      );
      return jsonResponse(result);
    },
  );

  // Get Board Active Sprint Tool
  server.registerTool(
    "get_board_active_sprint",
    {
      title: "Get Board Active Sprint",
      description:
        "Get the currently active sprint for a board. Returns null if no active sprint.",
      inputSchema: {
        boardId: z.number().describe("Board ID"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.getBoardActiveSprint(
        String(args.boardId),
      );
      return jsonResponse(result);
    },
  );

  // Get My Board Issues Tool (convenience tool for 80% use case)
  server.registerTool(
    "get_my_board_issues",
    {
      title: "Get My Board Issues",
      description:
        "Get issues assigned to current user on a board. By default, filters to active sprint. Set useActiveSprint=false or provide explicit sprintId to override.",
      inputSchema: {
        boardId: z.number().describe("Board ID"),
        sprintId: z
          .number()
          .optional()
          .describe(
            "Optional explicit sprint ID. If not provided and useActiveSprint=true, uses active sprint.",
          ),
        useActiveSprint: z
          .boolean()
          .optional()
          .describe(
            "Whether to auto-detect and use active sprint (default: true). Set to false to see all board issues regardless of sprint.",
          ),
        additionalJql: z
          .string()
          .optional()
          .describe(
            "Optional additional JQL filters (e.g., 'status = \"In Progress\"')",
          ),
        maxResults: z
          .number()
          .optional()
          .describe("Maximum number of results to return (default: 50)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.getMyBoardIssues(
        String(args.boardId),
        args.sprintId,
        args.useActiveSprint ?? true,
        args.additionalJql,
        args.maxResults,
      );
      return jsonResponse(result);
    },
  );
}
