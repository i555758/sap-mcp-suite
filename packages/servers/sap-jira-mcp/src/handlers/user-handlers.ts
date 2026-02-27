/**
 * User-related Jira tool handlers
 * Includes: get_user_info, get_user_id
 */
import { z } from "zod";
import { HandlerContext } from "./types.js";
import { textResponse } from "mcp-utils";

/**
 * Register user-related tools
 */
export function registerUserHandlers(context: HandlerContext): void {
  const {
    server,
    getJiraApiService,
    getFormatterService,
    initializeServices,
  } = context;

  // Get User Info Tool
  server.registerTool(
    "get_user_info",
    {
      title: "Get User Info",
      description: "Get name of a specific user, email, display name, etc",
      inputSchema: {
        username: z.string().describe("user name or email(e.g. aaa.bbb@xxx.com, or wendy li)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();
      const formatterService = getFormatterService();

      if (!jiraApiService || !formatterService) {
        throw new Error("Services not initialized");
      }

      const users = await jiraApiService.getUserInfo(args);
      return textResponse(formatterService.formatUserDetails(users));
    },
  );

  // Get User ID Tool
  server.registerTool(
    "get_user_id",
    {
      title: "Get User ID",
      description:
        "Get id of a specific user, which can use as assignee. But it will only return the 1st matching user. So you need provide the user name or email as accurate as you can.",
      inputSchema: {
        username: z.string().describe("user name or email(e.g. aaa.bbb@xxx.com, or wendy li), please provide the user name or email as accurate as you can"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();
      const formatterService = getFormatterService();

      if (!jiraApiService || !formatterService) {
        throw new Error("Services not initialized");
      }

      const users = await jiraApiService.getUserInfo(args);
      return textResponse(formatterService.formatUserId(users));
    },
  );
}
