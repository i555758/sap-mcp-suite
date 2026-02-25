/**
 * GitHub MCP server
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GitHubApiService } from './github-api.js';
import { FormatterService } from './formatter-service.js';
import { ConfigService } from './config-service.js';

/**
 * GitHub server class
 */
export class GitHubServer {
  private server: McpServer;
  private apiService: GitHubApiService | null = null;
  private formatterService: FormatterService | null = null;
  private configService: ConfigService;
  private apiUrl: string;
  private token: string;

  /**
   * Constructor
   * @param apiUrl GitHub API URL
   * @param token GitHub API token
   */
  constructor(apiUrl: string, token: string) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.configService = new ConfigService();

    this.server = new McpServer({
      name: "mcp-github",
      version: "1.0.0",
    });

    this.setupTools();

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Initialize services
   */
  private async initializeServices(): Promise<void> {
    if (!this.apiService || !this.formatterService) {
      this.apiService = new GitHubApiService(
        this.apiUrl,
        this.token,
        this.configService
      );
      
      this.formatterService = new FormatterService(this.configService);
    }
  }

  /**
   * Set up all tools using the new registerTool method
   */
  private setupTools(): void {
    // Get Current User Tool
    this.server.registerTool(
      "get_current_user",
      {
        title: "Get Current User",
        description: "Get details of the authenticated GitHub user",
        inputSchema: {}
      },
      async (args: any) => {
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const user = await this.apiService.getCurrentUser();
        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatUser(user),
            },
          ],
        };
      }
    );


    // List Repositories Tool
    this.server.registerTool(
      "list_repositories",
      {
        title: "List Repositories",
        description: "List repositories for the authenticated user",
        inputSchema: {
          visibility: z.enum(['all', 'public', 'private']).optional().describe("Repository visibility"),
          type: z.enum(['all', 'owner', 'public', 'private', 'member']).optional().describe("Repository type"),
          sort: z.enum(['created', 'updated', 'pushed', 'full_name']).optional().describe("Sort order"),
          direction: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
          per_page: z.number().optional().describe("Number of results per page (max 100)"),
          page: z.number().optional().describe("Page number")
        }
      },
      async (args: any) => {
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const repositories = await this.apiService.listRepositories(args);
        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatRepositoryList(repositories),
            },
          ],
        };
      }
    );

    // Get Repository Tool
    this.server.registerTool(
      "get_repository",
      {
        title: "Get Repository",
        description: "Get details of a specific repository including description, default branch, visibility, and more",
        inputSchema: {
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name")
        }
      },
      async (args: any) => {
        await this.initializeServices();

        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const repository = await this.apiService.getRepository({
          owner: args.owner,
          repo: args.repo
        });
        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatRepository(repository),
            },
          ],
        };
      }
    );

    // Create Issue Tool
    this.server.registerTool(
      "create_issue",
      {
        title: "Create Issue",
        description: "Create a new issue",
        inputSchema: {
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name"),
          title: z.string().describe("Issue title"),
          body: z.string().optional().describe("Issue body"),
          assignees: z.array(z.string()).optional().describe("List of assignees"),
          labels: z.array(z.string()).optional().describe("List of labels"),
          milestone: z.number().optional().describe("Milestone number")
        }
      },
      async (args: any) => {
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const issue = await this.apiService.createIssue(args);
        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatIssue(issue),
            },
          ],
        };
      }
    );

    // Create Pull Request Tool
    this.server.registerTool(
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
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        // Create the pull request first
        let pullRequest = await this.apiService.createPullRequest(args);
        
        // If assignees are specified, update the pull request to add them
        if (args.assignees && args.assignees.length > 0) {
          pullRequest = await this.apiService.updatePullRequest({
            owner: args.owner,
            repo: args.repo,
            pull_number: pullRequest.number,
            assignees: args.assignees
          });
        }

        // If reviewers are specified, request them
        if ((args.reviewers && args.reviewers.length > 0) || (args.team_reviewers && args.team_reviewers.length > 0)) {
          pullRequest = await this.apiService.requestReviewers({
            owner: args.owner,
            repo: args.repo,
            pull_number: pullRequest.number,
            reviewers: args.reviewers,
            team_reviewers: args.team_reviewers
          });
        }

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatPullRequest(pullRequest),
            },
          ],
        };
      }
    );

    // Update Pull Request Reviewers Tool
    this.server.registerTool(
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
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const pullRequest = await this.apiService.requestReviewers({
          owner: args.owner,
          repo: args.repo,
          pull_number: args.pull_number,
          reviewers: args.reviewers,
          team_reviewers: args.team_reviewers
        });

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatPullRequest(pullRequest),
            },
          ],
        };
      }
    );

    // Get Pull Request with Details Tool
    this.server.registerTool(
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
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const details = await this.apiService.getPullRequestWithDetails({
          owner: args.owner,
          repo: args.repo,
          pull_number: args.pull_number
        });

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatPullRequestWithDetails(details),
            },
          ],
        };
      }
    );

    // List Pull Request Reviews Tool
    this.server.registerTool(
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
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const reviews = await this.apiService.listPullRequestReviews({
          owner: args.owner,
          repo: args.repo,
          pull_number: args.pull_number,
          per_page: args.per_page,
          page: args.page
        });

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatPullRequestReviews(reviews),
            },
          ],
        };
      }
    );

    // List Pull Request Comments Tool
    this.server.registerTool(
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
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const commentType = args.comment_type || 'all';
        let output = '';

        if (commentType === 'review' || commentType === 'all') {
          const reviewComments = await this.apiService.listPullRequestReviewComments({
            owner: args.owner,
            repo: args.repo,
            pull_number: args.pull_number,
            per_page: args.per_page,
            page: args.page
          });
          
          if (commentType === 'all') {
            output += '# Review Comments\n\n';
          }
          output += this.formatterService.formatPullRequestReviewComments(reviewComments);
        }

        if (commentType === 'issue' || commentType === 'all') {
          const issueComments = await this.apiService.listPullRequestIssueComments({
            owner: args.owner,
            repo: args.repo,
            pull_number: args.pull_number,
            per_page: args.per_page,
            page: args.page
          });
          
          if (commentType === 'all') {
            output += '\n\n# General Comments\n\n';
          }
          output += this.formatterService.formatPullRequestIssueComments(issueComments);
        }

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      }
    );

    // List Pull Requests with Details Tool
    this.server.registerTool(
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
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const details = await this.apiService.listPullRequestsWithDetails({
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

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatPullRequestListWithDetails(details),
            },
          ],
        };
      }
    );

    // Reply to Comment Tool
    this.server.registerTool(
      "reply_to_comment",
      {
        title: "Reply to Comment",
        description: "Reply to a specific comment (issue comment or review comment)",
        inputSchema: {
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name"),
          comment_id: z.number().describe("ID of the comment to reply to"),
          body: z.string().describe("Reply content"),
          comment_type: z.enum(['issue', 'review']).optional().describe("Type of comment (default: issue)")
        }
      },
      async (args: any) => {
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        // Get the original comment first
        const originalComment = await this.apiService.getComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          comment_type: args.comment_type || 'issue'
        });

        // Create the reply
        const reply = await this.apiService.replyToComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          body: args.body,
          comment_type: args.comment_type || 'issue'
        });

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatCommentReply(reply, originalComment),
            },
          ],
        };
      }
    );

    // Get Comment Tool
    this.server.registerTool(
      "get_comment",
      {
        title: "Get Comment",
        description: "Get details of a specific comment (issue comment or review comment)",
        inputSchema: {
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name"),
          comment_id: z.number().describe("Comment ID"),
          comment_type: z.enum(['issue', 'review']).optional().describe("Type of comment (default: issue)")
        }
      },
      async (args: any) => {
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const comment = await this.apiService.getComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          comment_type: args.comment_type || 'issue'
        });

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatComment(comment, args.comment_type || 'issue'),
            },
          ],
        };
      }
    );

    // Update Comment Tool
    this.server.registerTool(
      "update_comment",
      {
        title: "Update Comment",
        description: "Update the content of a specific comment (issue comment or review comment)",
        inputSchema: {
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name"),
          comment_id: z.number().describe("Comment ID"),
          body: z.string().describe("New comment content"),
          comment_type: z.enum(['issue', 'review']).optional().describe("Type of comment (default: issue)")
        }
      },
      async (args: any) => {
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const comment = await this.apiService.updateComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          body: args.body,
          comment_type: args.comment_type || 'issue'
        });

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatCommentUpdate(comment),
            },
          ],
        };
      }
    );

    // Delete Comment Tool
    this.server.registerTool(
      "delete_comment",
      {
        title: "Delete Comment",
        description: "Delete a specific comment (issue comment or review comment)",
        inputSchema: {
          owner: z.string().describe("Repository owner"),
          repo: z.string().describe("Repository name"),
          comment_id: z.number().describe("Comment ID"),
          comment_type: z.enum(['issue', 'review']).optional().describe("Type of comment (default: issue)")
        }
      },
      async (args: any) => {
        await this.initializeServices();
        
        if (!this.apiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        await this.apiService.deleteComment({
          owner: args.owner,
          repo: args.repo,
          comment_id: args.comment_id,
          comment_type: args.comment_type || 'issue'
        });

        return {
          content: [
            {
              type: "text",
              text: `Comment #${args.comment_id} has been successfully deleted.`,
            },
          ],
        };
      }
    );

  }

  /**
   * Run the server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitHub MCP server running on stdio");
  }
}
