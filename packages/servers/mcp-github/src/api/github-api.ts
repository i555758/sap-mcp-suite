/**
 * GitHub API service
 */
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  GitHubRepository,
  GitHubUser,
  GitHubIssue,
  GitHubPullRequest
} from '../types.js';

/**
 * GitHub API service class
 *
 * Uses a request interceptor to fetch fresh credentials on every call,
 * so new PATs are picked up immediately without restarting the server.
 */
export class GitHubApiService {
  private client: AxiosInstance;

  constructor(apiUrl: string, getToken: () => Promise<string>) {
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GitHub-MCP-Server/1.0.0'
      }
    });

    // Resolve token on every request — picks up new PATs without restart
    this.client.interceptors.request.use(async (config) => {
      const token = await getToken();
      config.headers['Authorization'] = `Bearer ${token}`;
      return config;
    });
  }

  /**
   * Get authenticated user
   */
  async getCurrentUser(): Promise<GitHubUser> {
    const response: AxiosResponse<GitHubUser> = await this.client.get('/user');
    return response.data;
  }

  /**
   * List repositories for authenticated user
   */
  async listRepositories(args: {
    visibility?: 'all' | 'public' | 'private';
    affiliation?: string;
    type?: 'all' | 'owner' | 'public' | 'private' | 'member';
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    direction?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  } = {}): Promise<GitHubRepository[]> {
    // GitHub API: 'type' cannot be used with 'visibility' or 'affiliation'
    // If type is provided, use only type; otherwise use visibility/affiliation
    const params: Record<string, any> = {
      sort: args.sort || 'updated',
      direction: args.direction || 'desc',
      per_page: args.per_page || 30,
      page: args.page || 1
    };

    if (args.type) {
      params.type = args.type;
    } else {
      if (args.visibility) params.visibility = args.visibility;
      if (args.affiliation) params.affiliation = args.affiliation;
    }

    const response: AxiosResponse<GitHubRepository[]> = await this.client.get('/user/repos', { params });
    return response.data;
  }

  /**
   * Get repository
   */
  async getRepository(args: { owner: string; repo: string }): Promise<GitHubRepository> {
    const response: AxiosResponse<GitHubRepository> = await this.client.get(`/repos/${args.owner}/${args.repo}`);
    return response.data;
  }

  /**
   * List issues
   */
  async listIssues(args: {
    owner: string;
    repo: string;
    milestone?: string | number;
    state?: 'open' | 'closed' | 'all';
    assignee?: string;
    creator?: string;
    mentioned?: string;
    labels?: string;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
    since?: string;
    per_page?: number;
    page?: number;
  }): Promise<GitHubIssue[]> {
    const params = {
      milestone: args.milestone,
      state: args.state || 'open',
      assignee: args.assignee,
      creator: args.creator,
      mentioned: args.mentioned,
      labels: args.labels,
      sort: args.sort || 'created',
      direction: args.direction || 'desc',
      since: args.since,
      per_page: args.per_page || 30,
      page: args.page || 1
    };

    const response: AxiosResponse<GitHubIssue[]> = await this.client.get(`/repos/${args.owner}/${args.repo}/issues`, { params });
    return response.data;
  }

  /**
   * Create issue
   */
  async createIssue(args: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    assignees?: string[];
    milestone?: number;
    labels?: string[];
  }): Promise<GitHubIssue> {
    const { owner, repo, ...issueData } = args;
    const response: AxiosResponse<GitHubIssue> = await this.client.post(`/repos/${owner}/${repo}/issues`, issueData);
    return response.data;
  }

  /**
   * List pull requests
   */
  async listPullRequests(args: {
    owner: string;
    repo: string;
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    sort?: 'created' | 'updated' | 'popularity';
    direction?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }): Promise<GitHubPullRequest[]> {
    const params = {
      state: args.state || 'open',
      head: args.head,
      base: args.base,
      sort: args.sort || 'created',
      direction: args.direction || 'desc',
      per_page: args.per_page || 30,
      page: args.page || 1
    };

    const response: AxiosResponse<GitHubPullRequest[]> = await this.client.get(`/repos/${args.owner}/${args.repo}/pulls`, { params });
    return response.data;
  }

  /**
   * Get pull request
   */
  async getPullRequest(args: { owner: string; repo: string; pull_number: number }): Promise<GitHubPullRequest> {
    const response: AxiosResponse<GitHubPullRequest> = await this.client.get(`/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}`);
    return response.data;
  }

  /**
   * Create pull request
   */
  async createPullRequest(args: {
    owner: string;
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
    maintainer_can_modify?: boolean;
    draft?: boolean;
  }): Promise<GitHubPullRequest> {
    const { owner, repo, ...prData } = args;
    const response: AxiosResponse<GitHubPullRequest> = await this.client.post(`/repos/${owner}/${repo}/pulls`, prData);
    return response.data;
  }

  /**
   * Update pull request
   */
  async updatePullRequest(args: {
    owner: string;
    repo: string;
    pull_number: number;
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    base?: string;
    maintainer_can_modify?: boolean;
    assignees?: string[];
  }): Promise<GitHubPullRequest> {
    const { owner, repo, pull_number, ...updateData } = args;
    const response: AxiosResponse<GitHubPullRequest> = await this.client.patch(`/repos/${owner}/${repo}/pulls/${pull_number}`, updateData);
    return response.data;
  }

  /**
   * Reply to a comment (works for issue comments, review comments, and pull request comments)
   */
  async replyToComment(args: {
    owner: string;
    repo: string;
    comment_id: number;
    body: string;
    comment_type?: 'issue' | 'review';
  }): Promise<any> {
    const { owner, repo, comment_id, body, comment_type = 'issue' } = args;

    if (comment_type === 'review') {
      // For review comments, we need to create a reply to the review comment
      const response = await this.client.post(
        `/repos/${owner}/${repo}/pulls/comments/${comment_id}/replies`,
        { body }
      );
      return response.data;
    } else {
      // For issue comments, we need to get the original comment first to find the issue number
      // Then create a new comment that references the original
      const originalComment = await this.client.get(`/repos/${owner}/${repo}/issues/comments/${comment_id}`);
      const issueUrl = originalComment.data.issue_url;
      const issueNumber = parseInt(issueUrl.split('/').pop() || '0');

      // Create a reply comment that mentions the original comment
      const replyBody = `@${originalComment.data.user.login} ${body}`;
      const response = await this.client.post(
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        { body: replyBody }
      );
      return response.data;
    }
  }

  /**
   * Get a specific comment (issue comment or review comment)
   */
  async getComment(args: {
    owner: string;
    repo: string;
    comment_id: number;
    comment_type?: 'issue' | 'review';
  }): Promise<any> {
    const { owner, repo, comment_id, comment_type = 'issue' } = args;

    if (comment_type === 'review') {
      const response = await this.client.get(`/repos/${owner}/${repo}/pulls/comments/${comment_id}`);
      return response.data;
    } else {
      const response = await this.client.get(`/repos/${owner}/${repo}/issues/comments/${comment_id}`);
      return response.data;
    }
  }

  /**
   * Update a comment (issue comment or review comment)
   */
  async updateComment(args: {
    owner: string;
    repo: string;
    comment_id: number;
    body: string;
    comment_type?: 'issue' | 'review';
  }): Promise<any> {
    const { owner, repo, comment_id, body, comment_type = 'issue' } = args;

    if (comment_type === 'review') {
      const response = await this.client.patch(`/repos/${owner}/${repo}/pulls/comments/${comment_id}`, { body });
      return response.data;
    } else {
      const response = await this.client.patch(`/repos/${owner}/${repo}/issues/comments/${comment_id}`, { body });
      return response.data;
    }
  }

  /**
   * Delete a comment (issue comment or review comment)
   */
  async deleteComment(args: {
    owner: string;
    repo: string;
    comment_id: number;
    comment_type?: 'issue' | 'review';
  }): Promise<void> {
    const { owner, repo, comment_id, comment_type = 'issue' } = args;

    if (comment_type === 'review') {
      await this.client.delete(`/repos/${owner}/${repo}/pulls/comments/${comment_id}`);
    } else {
      await this.client.delete(`/repos/${owner}/${repo}/issues/comments/${comment_id}`);
    }
  }

  /**
   * Request reviewers for a pull request
   */
  async requestReviewers(args: {
    owner: string;
    repo: string;
    pull_number: number;
    reviewers?: string[];
    team_reviewers?: string[];
  }): Promise<GitHubPullRequest> {
    const { owner, repo, pull_number, reviewers, team_reviewers } = args;
    const requestData: any = {};

    if (reviewers && reviewers.length > 0) {
      requestData.reviewers = reviewers;
    }

    if (team_reviewers && team_reviewers.length > 0) {
      requestData.team_reviewers = team_reviewers;
    }

    const response: AxiosResponse<GitHubPullRequest> = await this.client.post(
      `/repos/${owner}/${repo}/pulls/${pull_number}/requested_reviewers`,
      requestData
    );
    return response.data;
  }

  /**
   * List reviews for a pull request
   */
  async listPullRequestReviews(args: {
    owner: string;
    repo: string;
    pull_number: number;
    per_page?: number;
    page?: number;
  }): Promise<any[]> {
    const params = {
      per_page: args.per_page || 30,
      page: args.page || 1
    };

    const response = await this.client.get(`/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}/reviews`, { params });
    return response.data;
  }

  /**
   * List review comments for a pull request
   */
  async listPullRequestReviewComments(args: {
    owner: string;
    repo: string;
    pull_number: number;
    sort?: 'created' | 'updated';
    direction?: 'asc' | 'desc';
    since?: string;
    per_page?: number;
    page?: number;
  }): Promise<any[]> {
    const params = {
      sort: args.sort || 'created',
      direction: args.direction || 'desc',
      since: args.since,
      per_page: args.per_page || 30,
      page: args.page || 1
    };

    const response = await this.client.get(`/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}/comments`, { params });
    return response.data;
  }

  /**
   * List issue comments for a pull request (general comments, not code review comments)
   */
  async listPullRequestIssueComments(args: {
    owner: string;
    repo: string;
    pull_number: number;
    since?: string;
    per_page?: number;
    page?: number;
  }): Promise<any[]> {
    const params = {
      since: args.since,
      per_page: args.per_page || 30,
      page: args.page || 1
    };

    const response = await this.client.get(`/repos/${args.owner}/${args.repo}/issues/${args.pull_number}/comments`, { params });
    return response.data;
  }

  /**
   * Get pull request with detailed information including reviews and comments
   */
  async getPullRequestWithDetails(args: {
    owner: string;
    repo: string;
    pull_number: number;
  }): Promise<{
    pullRequest: GitHubPullRequest;
    reviews: any[];
    reviewComments: any[];
    issueComments: any[];
  }> {
    const [pullRequest, reviews, reviewComments, issueComments] = await Promise.all([
      this.getPullRequest(args),
      this.listPullRequestReviews(args),
      this.listPullRequestReviewComments(args),
      this.listPullRequestIssueComments(args)
    ]);

    return {
      pullRequest,
      reviews,
      reviewComments,
      issueComments
    };
  }

  /**
   * List pull requests with enhanced information
   */
  async listPullRequestsWithDetails(args: {
    owner: string;
    repo: string;
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    sort?: 'created' | 'updated' | 'popularity';
    direction?: 'asc' | 'desc';
    per_page?: number;
    page?: number;
  }): Promise<{
    pullRequests: GitHubPullRequest[];
    reviewSummaries: { [key: number]: { reviewCount: number; approvals: number; changesRequested: number; } };
  }> {
    const pullRequests = await this.listPullRequests(args);
    const reviewSummaries: { [key: number]: { reviewCount: number; approvals: number; changesRequested: number; } } = {};

    // Get review summaries for each PR
    for (const pr of pullRequests) {
      try {
        const reviews = await this.listPullRequestReviews({
          owner: args.owner,
          repo: args.repo,
          pull_number: pr.number
        });

        reviewSummaries[pr.number] = {
          reviewCount: reviews.length,
          approvals: reviews.filter(r => r.state === 'APPROVED').length,
          changesRequested: reviews.filter(r => r.state === 'CHANGES_REQUESTED').length
        };
      } catch (error) {
        // If we can't get reviews for a PR, set default values
        reviewSummaries[pr.number] = {
          reviewCount: 0,
          approvals: 0,
          changesRequested: 0
        };
      }
    }

    return {
      pullRequests,
      reviewSummaries
    };
  }
}
