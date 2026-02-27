/**
 * Transition API module for Jira
 * Handles workflow transitions (status changes)
 */
import { GetTransitionsRequest, UpdateTransitionRequest } from "../../types.js";
import { BaseJiraApi } from "./base.js";

/**
 * Transition API class for managing Jira workflow transitions
 */
export class TransitionApi extends BaseJiraApi {
  /**
   * Get available transitions for an issue
   * @param request Get transitions request
   * @returns Available transitions for the issue
   */
  async getTransitions(request: GetTransitionsRequest): Promise<any> {
    try {
      const response = await this.axiosInstance.get(
        `/issue/${request.issue_key}/transitions`,
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Update transition (change status) for an issue
   * @param request Update transition request
   * @returns Response from the API
   */
  async updateTransition(request: UpdateTransitionRequest): Promise<any> {
    try {
      const body: any = {
        transition: {
          id: request.transition_id,
        },
      };

      // Add comment if provided
      if (request.comment) {
        body.update = {
          comment: [
            {
              add: {
                body: request.comment,
              },
            },
          ],
        };
      }

      const response = await this.axiosInstance.post(
        `/issue/${request.issue_key}/transitions`,
        body,
      );

      return {
        success: true,
        message: `Successfully transitioned issue ${request.issue_key} using transition ID ${request.transition_id}`,
        data: response.data,
      };
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }
}
