/**
 * User API module for Jira
 * Handles user-related operations
 */
import { GetUserInfoRequest, JiraUser } from "../../types.js";
import { BaseJiraApi } from "./base.js";
import { logger } from "../../utils/logger.js";

/**
 * User API class for managing Jira users
 */
export class UserApi extends BaseJiraApi {
  /**
   * Get current logged-in user
   * @returns Current user information
   */
  async getCurrentUser(): Promise<any> {
    try {
      const response = await this.axiosInstance.get("/myself");
      return response.data;
    } catch (error) {
      logger.error("Error getting current user:", error);
      return null;
    }
  }

  /**
   * Get user information
   * @param request Get user info request
   * @returns User information
   */
  async getUserInfo(request: GetUserInfoRequest): Promise<JiraUser[]> {
    try {
      const response = await this.axiosInstance.get("/user/search", {
        params: {
          username: request.username,
        },
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }
}
