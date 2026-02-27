/**
 * Pull request handlers for GitHub MCP server
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textResponse, textError } from "mcp-utils";
import { GitHubApiService } from '../api/github-api.js';
import * as formatter from '../services/formatter-service.js';

/**
 * Format error message for user-friendly display
 */
function formatError(error: unknown, operation: string): string {
  if (error instanceof Error) {
    const axiosError = error as any;
    if (axiosError.response?.data?.message) {
      return `Failed to ${operation}: ${axiosError.response.data.message}`;
    }
    if (axiosError.response?.status) {
      const status = axiosError.response.status;
      if (status === 401) {
        return `Failed to ${operation}: Authentication failed. Please check your GitHub token.`;
      }
      if (status === 403) {
        return `Failed to ${operation}: Access forbidden. You may not have permission for this action.`;
      }
      if (status === 404) {
        return `Failed to ${operation}: Resource not found.`;
      }
      if (status === 422) {
        return `Failed to ${operation}: Invalid request parameters.`;
      }
      return `Failed to ${operation}: HTTP ${status} error.`;
    }
    return `Failed to ${operation}: ${error.message}`;
  }
  return `Failed to ${operation}: An unexpected error occurred.`;
}

/**
 * Register pull request-related tools
 */
export function registerPrHandlers(
  server: McpServer,
  getServices: () => Promise<{ api: GitHubApiService }>
): void {
  // Create Pull Request Tool
  server.registerTool(
    "create_pull_request",
    {
      title: "Create Pull Request",
      description: "Create a new pull request",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Pull request title"),
        head: z.string().describe("Head branch"),
        base: z.string().describe("Base branch"),
        body: z.string().optional().describe("Pull request body"),
        draft: z.boolean().optional().describe("Whether this is a draft PR"),
        assignees: z.array(z.string()).optional().describe("List of assignees"),
        reviewers: z.array(z.string()).optional().describe("List of reviewers (user logins)"),
        team_reviewers: z.array(z.string()).optional().describe("List of team reviewers (team slugs)")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();

        // Create the pull request first
        let pullRequest = await api.createPullRequest(args);

        // If assignees are specified, update the pull request to add them
        if (args.assignees && args.assignees.length > 0) {
          pullRequest = await api.updatePullRequest({
            owner: args.owner,
            repo: args.repo,
            pull_number: pullRequest.number,
            assignees: args.assignees
          });
        }

        // If reviewers are specified, request them
        if ((args.reviewers && args.reviewers.length > 0) || (args.team_reviewers && args.team_reviewers.length > 0)) {
          pullRequest = await api.requestReviewers({
            owner: args.owner,
            repo: args.repo,
            pull_number: pullRequest.number,
            reviewers: args.reviewers,
            team_reviewers: args.team_reviewers
          });
        }

        return textResponse(formatter.formatPullRequest(pullRequest));
      } catch (error) {
        return textError(formatError(error, "create pull request"));
      }
    }
  );

  // Update Pull Request Reviewers Tool
  server.registerTool(
    "update_pull_request_reviewers",
    {
      title: "Update Pull Request Reviewers",
      description: "Add reviewers to an existing pull request",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number"),
        reviewers: z.array(z.string()).optional().describe("List of reviewers (user logins)"),
        team_reviewers: z.array(z.string()).optional().describe("List of team reviewers (team slugs)")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const pullRequest = await api.requestReviewers({
          owner: args.owner,
          repo: args.repo,
          pull_number: args.pull_number,
          reviewers: args.reviewers,
          team_reviewers: args.team_reviewers
        });

        return textResponse(formatter.formatPullRequest(pullRequest));
      } catch (error) {
        return textError(formatError(error, "update pull request reviewers"));
      }
    }
  );

  // Get Pull Request with Details Tool
  server.registerTool(
    "get_pull_request_details",
    {
      title: "Get Pull Request Details",
      description: "Get detailed pull request information including reviews and comments",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const details = await api.getPullRequestWithDetails({
          owner: args.owner,
          repo: args.repo,
          pull_number: args.pull_number
        });

        return textResponse(formatter.formatPullRequestWithDetails(details));
      } catch (error) {
        return textError(formatError(error, "get pull request details"));
      }
    }
  );

  // List Pull Request Reviews Tool
  server.registerTool(
    "list_pull_request_reviews",
    {
      title: "List Pull Request Reviews",
      description: "List all reviews for a pull request",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number"),
        per_page: z.number().optional().describe("Number of results per page (max 100)"),
        page: z.number().optional().describe("Page number")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const reviews = await api.listPullRequestReviews({
          owner: args.owner,
          repo: args.repo,
          pull_number: args.pull_number,
          per_page: args.per_page,
          page: args.page
        });

        return textResponse(formatter.formatPullRequestReviews(reviews));
      } catch (error) {
        return textError(formatError(error, "list pull request reviews"));
      }
    }
  );

  // List Pull Request Comments Tool
  server.registerTool(
    "list_pull_request_comments",
    {
      title: "List Pull Request Comments",
      description: "List all comments (review comments and general comments) for a pull request",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number"),
        comment_type: z.enum(['review', 'issue', 'all']).optional().describe("Type of comments to retrieve (default: all)"),
        per_page: z.number().optional().describe("Number of results per page (max 100)"),
        page: z.number().optional().describe("Page number")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const commentType = args.comment_type || 'all';
        let output = '';

        if (commentType === 'review' || commentType === 'all') {
          const reviewComments = await api.listPullRequestReviewComments({
            owner: args.owner,
            repo: args.repo,
            pull_number: args.pull_number,
            per_page: args.per_page,
            page: args.page
          });

          if (commentType === 'all') {
            output += '# Review Comments\n\n';
          }
          output += formatter.formatPullRequestReviewComments(reviewComments);
        }

        if (commentType === 'issue' || commentType === 'all') {
          const issueComments = await api.listPullRequestIssueComments({
            owner: args.owner,
            repo: args.repo,
            pull_number: args.pull_number,
            per_page: args.per_page,
            page: args.page
          });

          if (commentType === 'all') {
            output += '\n\n# General Comments\n\n';
          }
          output += formatter.formatPullRequestIssueComments(issueComments);
        }

        return textResponse(output);
      } catch (error) {
        return textError(formatError(error, "list pull request comments"));
      }
    }
  );

  // List Pull Requests with Details Tool
  server.registerTool(
    "list_pull_requests_with_details",
    {
      title: "List Pull Requests with Details",
      description: "List pull requests with enhanced information including review summaries",
      inputSchema: {
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        state: z.enum(['open', 'closed', 'all']).optional().describe("Pull request state"),
        head: z.string().optional().describe("Head branch"),
        base: z.string().optional().describe("Base branch"),
        sort: z.enum(['created', 'updated', 'popularity']).optional().describe("Sort order"),
        direction: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
        per_page: z.number().optional().describe("Number of results per page (max 100)"),
        page: z.number().optional().describe("Page number")
      }
    },
    async (args: any) => {
      try {
        const { api } = await getServices();
        const details = await api.listPullRequestsWithDetails({
          owner: args.owner,
          repo: args.repo,
          state: args.state,
          head: args.head,
          base: args.base,
          sort: args.sort,
          direction: args.direction,
          per_page: args.per_page,
          page: args.page
        });

        return textResponse(formatter.formatPullRequestListWithDetails(details));
      } catch (error) {
        return textError(formatError(error, "list pull requests with details"));
      }
    }
  );
}
