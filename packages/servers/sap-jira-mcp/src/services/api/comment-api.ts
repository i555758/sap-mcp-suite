/**
 * Comment API module for Jira
 * Handles comment operations on issues
 */
import { AddCommentRequest } from "../../types.js";
import { BaseJiraApi } from "./base.js";

/**
 * Comment API class for managing Jira issue comments
 */
export class CommentApi extends BaseJiraApi {
  /**
   * Add a comment to an issue
   * @param request Add comment request
   */
  async addComment(request: AddCommentRequest): Promise<void> {
    try {
      await this.axiosInstance.post(`/issue/${request.issue_key}/comment`, {
        body: request.comment,
      });
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Delete a comment from an issue
   * @param issueKey Issue key
   * @param commentId Comment ID to delete
   */
  async deleteComment(issueKey: string, commentId: string): Promise<void> {
    try {
      await this.axiosInstance.delete(
        `/issue/${issueKey}/comment/${commentId}`,
      );
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }
}
