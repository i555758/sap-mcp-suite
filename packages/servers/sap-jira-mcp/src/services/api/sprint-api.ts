/**
 * Sprint API module for Jira
 * Handles Sprint/Agile operations
 */
import axios from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseJiraApi } from "./base.js";
import { logger } from "../../utils/logger.js";

/**
 * Sprint API class for managing Jira sprints
 */
export class SprintApi extends BaseJiraApi {
  /**
   * Get sprint values for a specific issue
   * @param issueKey Issue key (e.g., MOB-123)
   * @returns Sprint values set for the issue
   */
  async getIssueSprintValues(issueKey: string): Promise<any> {
    try {
      // Get the issue with sprint field
      const response = await this.axiosInstance.get(`/issue/${issueKey}`, {
        params: {
          fields: "customfield_12740", // Sprint field ID from the metadata
        },
      });

      const issue = response.data;
      const sprintField = issue.fields?.customfield_12740;

      const result: any = {
        issueKey: issueKey,
        sprintField: "customfield_12740",
        sprintFieldName: "Sprint",
        values: sprintField || [],
        _meta: {
          api_endpoint: `${this.axiosInstance.defaults.baseURL}/issue/${issueKey}`,
          field_type: "array",
          field_custom: "com.pyxis.greenhopper.jira:gh-sprint",
          field_customId: 12740,
        },
      };

      return result;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get sprint values for a specific project
   * @param projectKey Project key (e.g., MOB, WRK)
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns All available sprint values for the project
   */
  async getProjectSprintValues(
    projectKey: string,
    maxResults: number = 50,
  ): Promise<any> {
    try {
      // Use the Greenhopper API to get sprints for the project
      // First, we need to find the board ID for the project
      const boardsResponse = await this.axiosInstance.get(
        "/rest/agile/1.0/board",
        {
          params: {
            projectKeyOrId: projectKey,
            maxResults: 50,
          },
        },
      );

      const boards = boardsResponse.data.values || [];
      if (boards.length === 0) {
        return {
          projectKey: projectKey,
          values: [],
          _meta: {
            api_endpoint: `${this.axiosInstance.defaults.baseURL}/rest/agile/1.0/board`,
            message: `No boards found for project ${projectKey}`,
          },
        };
      }

      // Use the first board found for the project
      const boardId = boards[0].id;

      // Get all sprints for the board
      const sprintsResponse = await this.axiosInstance.get(
        `/rest/agile/1.0/board/${boardId}/sprint`,
        {
          params: {
            maxResults: maxResults,
          },
        },
      );

      const sprints = sprintsResponse.data.values || [];

      const result: any = {
        projectKey: projectKey,
        boardId: boardId,
        boardName: boards[0].name,
        values: sprints.map((sprint: any) => ({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          completeDate: sprint.completeDate,
          goal: sprint.goal,
        })),
        _meta: {
          api_endpoint: `${this.axiosInstance.defaults.baseURL}/rest/agile/1.0/board/${boardId}/sprint`,
          total_sprints: sprints.length,
          field_type: "array",
          field_custom: "com.pyxis.greenhopper.jira:gh-sprint",
          field_customId: 12740,
          sprintField: "customfield_12740",
        },
      };

      return result;
    } catch (error) {
      // If Agile API fails, try alternative approach using search
      try {
        logger.debug("Agile API failed, trying alternative approach:", error);

        // Search for issues in the project that have sprint values
        const searchResponse = await this.axiosInstance.get("/search", {
          params: {
            jql: `project = ${projectKey} AND Sprint is not EMPTY`,
            fields: "customfield_12740",
            maxResults: maxResults,
          },
        });

        const issues = searchResponse.data.issues || [];
        const sprintValues = new Set<string>();

        // Collect all unique sprint values from issues
        for (const issue of issues) {
          const sprintField = issue.fields?.customfield_12740;
          if (Array.isArray(sprintField)) {
            sprintField.forEach((sprint: any) => {
              if (typeof sprint === "string") {
                sprintValues.add(sprint);
              } else if (sprint && typeof sprint === "object" && sprint.name) {
                sprintValues.add(sprint.name);
              }
            });
          }
        }

        const result: any = {
          projectKey: projectKey,
          values: Array.from(sprintValues).map((sprintName) => ({
            name: sprintName,
            source: "issue_search",
          })),
          _meta: {
            api_endpoint: `${this.axiosInstance.defaults.baseURL}/search`,
            method: "issue_search_fallback",
            total_issues_searched: issues.length,
            field_type: "array",
            field_custom: "com.pyxis.greenhopper.jira:gh-sprint",
            field_customId: 12740,
            sprintField: "customfield_12740",
          },
        };

        return result;
      } catch (fallbackError) {
        this.handleApiError(fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Handle sprint field creation with proper validation and mapping
   * @param fields Fields object to modify
   * @param value Sprint value (name, ID, or array)
   * @returns Sprint ID if found, null otherwise (for post-creation assignment)
   */
  async handleSprintCreation(
    fields: any,
    value: any,
  ): Promise<number | null> {
    try {
      logger.debug(`Handling sprint creation with value:`, value);

      // Normalize the value to handle different input formats
      let sprintValue = value;
      if (Array.isArray(value) && value.length > 0) {
        sprintValue = value[0]; // Take the first element if it's an array
      }

      // Convert to string for processing
      const sprintStr = String(sprintValue);

      // Get available sprints for the project
      let availableSprints: any[] = [];
      try {
        const projectSprintValues = await this.getProjectSprintValues(
          this.projectKey,
        );
        availableSprints = projectSprintValues.values || [];
      } catch (error) {
        logger.debug(
          `Failed to get project sprint values, continuing with direct creation:`,
          error,
        );
      }

      logger.debug(
        `Available sprints from API:`,
        availableSprints.map((s: any) => ({ id: s.id, name: s.name })),
      );

      // Try to find matching sprint by name or ID
      let matchingSprint = null;
      let sprintId = null;

      // First try exact name match
      if (availableSprints.length > 0) {
        matchingSprint = availableSprints.find(
          (sprint: any) =>
            sprint.name &&
            sprint.name.toLowerCase() === sprintStr.toLowerCase(),
        );

        // If not found by name, try ID match
        if (!matchingSprint && /^\d+$/.test(sprintStr)) {
          matchingSprint = availableSprints.find(
            (sprint: any) => sprint.id && sprint.id.toString() === sprintStr,
          );
        }

        // If not found, try partial name match
        if (!matchingSprint) {
          matchingSprint = availableSprints.find(
            (sprint: any) =>
              sprint.name &&
              sprint.name.toLowerCase().includes(sprintStr.toLowerCase()),
          );
        }

        if (matchingSprint) {
          sprintId = matchingSprint.id;
          logger.debug(
            `Found matching sprint: ${matchingSprint.name} (ID: ${sprintId})`,
          );
        }
      }

      // If no match found but value is numeric, use it as sprint ID
      if (!sprintId && /^\d+$/.test(sprintStr)) {
        sprintId = parseInt(sprintStr);
        logger.debug(`Using numeric value as sprint ID: ${sprintId}`);
      }

      if (sprintId) {
        logger.debug(
          `Sprint ID ${sprintId} will be assigned after issue creation using Agile API`,
        );
        // Don't set the field during creation - return the sprint ID for post-creation assignment
        return sprintId;
      } else {
        logger.debug(
          `No matching sprint found for "${sprintStr}", sprint will not be assigned`,
        );
        return null;
      }
    } catch (error) {
      logger.error(`Error handling sprint creation:`, error);
      return null;
    }
  }

  /**
   * Handle sprint field update with proper validation and mapping
   * @param updateData Update data object to modify
   * @param value Sprint value (name, ID, or array)
   * @param issueKey Issue key for context
   */
  async handleSprintUpdate(
    updateData: any,
    value: any,
    issueKey: string,
  ): Promise<void> {
    try {
      logger.debug(`Handling sprint update for ${issueKey} with value:`, value);

      // Normalize the value to handle different input formats
      let sprintValue = value;
      if (Array.isArray(value) && value.length > 0) {
        sprintValue = value[0]; // Take the first element if it's an array
      }

      // Convert to string for processing
      const sprintStr = String(sprintValue);

      // Get available sprints for the project
      let availableSprints: any[] = [];
      try {
        const projectSprintValues = await this.getProjectSprintValues(
          this.projectKey,
        );
        availableSprints = projectSprintValues.values || [];
      } catch (error) {
        logger.debug(
          `Failed to get project sprint values, continuing with direct update:`,
          error,
        );
      }

      logger.debug(
        `Available sprints from API:`,
        availableSprints.map((s: any) => ({ id: s.id, name: s.name })),
      );

      // Try to find matching sprint by name or ID
      let matchingSprint = null;
      let sprintId = null;

      // First try exact name match
      if (availableSprints.length > 0) {
        matchingSprint = availableSprints.find(
          (sprint: any) =>
            sprint.name &&
            sprint.name.toLowerCase() === sprintStr.toLowerCase(),
        );

        // If not found by name, try ID match
        if (!matchingSprint && /^\d+$/.test(sprintStr)) {
          matchingSprint = availableSprints.find(
            (sprint: any) => sprint.id && sprint.id.toString() === sprintStr,
          );
        }

        // If not found, try partial name match
        if (!matchingSprint) {
          matchingSprint = availableSprints.find(
            (sprint: any) =>
              sprint.name &&
              sprint.name.toLowerCase().includes(sprintStr.toLowerCase()),
          );
        }

        if (matchingSprint) {
          sprintId = matchingSprint.id;
          logger.debug(
            `Found matching sprint: ${matchingSprint.name} (ID: ${sprintId})`,
          );
        }
      }

      // If no match found but value is numeric, use it as sprint ID
      if (!sprintId && /^\d+$/.test(sprintStr)) {
        sprintId = parseInt(sprintStr);
        logger.debug(`Using numeric value as sprint ID: ${sprintId}`);
      }

      // If no sprint ID found yet, try to extract from complex sprint string format
      if (!sprintId) {
        for (const sprint of availableSprints) {
          if (sprint.name && typeof sprint.name === "string") {
            // Extract ID from the complex string format like "id=327032"
            const idMatch = sprint.name.match(/id=(\d+)/);
            if (idMatch && idMatch[1]) {
              const extractedId = parseInt(idMatch[1]);

              // Extract name from the complex string format like "name=Mobile 2508"
              const nameMatch = sprint.name.match(/name=([^,\]]+)/);
              if (nameMatch && nameMatch[1]) {
                const extractedName = nameMatch[1].trim();

                // Check if the extracted name matches our search string
                if (
                  extractedName.toLowerCase() === sprintStr.toLowerCase() ||
                  extractedName
                    .toLowerCase()
                    .includes(sprintStr.toLowerCase()) ||
                  sprintStr.toLowerCase().includes(extractedName.toLowerCase())
                ) {
                  sprintId = extractedId;
                  logger.debug(
                    `Extracted sprint ID from complex string for "${sprintStr}": ${sprintId} (name: ${extractedName})`,
                  );
                  break;
                }
              }

              // Also check if the sprint ID matches directly
              if (extractedId.toString() === sprintStr) {
                sprintId = extractedId;
                logger.debug(
                  `Found matching sprint ID in complex string: ${sprintId}`,
                );
                break;
              }
            }
          }
        }
      }

      if (sprintId) {
        // For sprint updates, prioritize the Agile API approach as it's more reliable
        let agileApiSuccess = false;

        try {
          // Create a new axios instance for the Agile API call with the correct base URL
          const agileAxios = axios.create({
            baseURL: this.axiosInstance.defaults.baseURL!.replace(
              "/rest/api/2",
              "",
            ),
            headers: this.axiosInstance.defaults.headers,
          });

          const agileApiUrl = `/rest/agile/1.0/sprint/${sprintId}/issue`;

          logger.debug(
            `Attempting Agile API call to: ${agileAxios.defaults.baseURL}${agileApiUrl}`,
          );
          logger.debug(`Request payload:`, { issues: [issueKey] });

          const response = await agileAxios.post(agileApiUrl, {
            issues: [issueKey],
          });

          logger.debug(`Agile API response:`, response.status, response.data);
          logger.info(
            `Successfully moved issue ${issueKey} to sprint ID ${sprintId} using Agile API`,
          );
          agileApiSuccess = true;

          // Don't set the field update since Agile API succeeded
          delete updateData.fields.customfield_12740;
        } catch (agileApiError: any) {
          logger.debug(`Agile API failed for sprint ${sprintId}:`, {
            status: agileApiError.response?.status,
            statusText: agileApiError.response?.statusText,
            data: agileApiError.response?.data,
            message: agileApiError.message,
          });
          agileApiSuccess = false;
        }

        // If Agile API failed, try direct field update as fallback
        if (!agileApiSuccess) {
          logger.debug(
            `Falling back to direct field update for sprint ${sprintId}`,
          );
          updateData.fields.customfield_12740 = [sprintId];
          logger.debug(`Set sprint field to array format: [${sprintId}]`);
        }
      } else {
        // If no numeric ID available, try to use the value directly
        logger.debug(
          `No matching sprint found for "${sprintStr}", attempting direct assignment`,
        );

        // Try different formats that Jira might accept
        if (Array.isArray(value)) {
          updateData.fields.customfield_12740 = value;
        } else {
          updateData.fields.customfield_12740 = [sprintStr];
        }
        logger.debug(
          `Set sprint field to direct value:`,
          updateData.fields.customfield_12740,
        );
      }
    } catch (error) {
      logger.error(`Error handling sprint update:`, error);
      // Don't throw error, just log it and continue with other field updates
      logger.warn(`Sprint update failed, continuing with other field updates`);
    }
  }

  /**
   * Update issue sprint using Agile API
   * @param issueKey Issue key (e.g., MOB-123)
   * @param sprintId Target sprint ID
   * @returns Success status
   */
  async updateIssueSprint(issueKey: string, sprintId: number): Promise<any> {
    try {
      logger.debug(
        `Updating issue ${issueKey} to sprint ${sprintId} using Agile API`,
      );

      // Create a new axios instance for the Agile API call with the correct base URL
      const agileAxios = axios.create({
        baseURL: this.axiosInstance.defaults.baseURL!.replace(
          "/rest/api/2",
          "",
        ),
        headers: this.axiosInstance.defaults.headers,
      });

      const agileApiUrl = `/rest/agile/1.0/sprint/${sprintId}/issue`;

      logger.debug(
        `Making Agile API call to: ${agileAxios.defaults.baseURL}${agileApiUrl}`,
      );
      logger.debug(`Request payload:`, { issues: [issueKey] });

      const response = await agileAxios.post(agileApiUrl, {
        issues: [issueKey],
      });

      logger.debug(`Agile API response:`, response.status, response.data);
      logger.info(
        `Successfully moved issue ${issueKey} to sprint ID ${sprintId} using Agile API`,
      );

      return {
        success: true,
        issueKey: issueKey,
        sprintId: sprintId,
        message: `Issue ${issueKey} successfully moved to sprint ${sprintId}`,
        apiResponse: response.data,
      };
    } catch (error: any) {
      logger.debug(`Agile API failed for sprint ${sprintId}:`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      // Handle specific error cases
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;

        if (status === 404) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Sprint ${sprintId} or issue ${issueKey} not found`,
          );
        } else if (status === 400) {
          const errorMessage =
            data?.errorMessages?.[0] || data?.message || "Bad request";
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Failed to update sprint: ${errorMessage}`,
          );
        } else if (status === 403) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Permission denied: You don't have permission to move issues to sprint ${sprintId}`,
          );
        }
      }

      this.handleApiError(error);
      throw error;
    }
  }
}
