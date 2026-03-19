/**
 * Board API module for Jira
 * Handles Agile Board operations using /rest/agile/1.0/board endpoints
 */
import axios from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseJiraApi } from "./base.js";
import { logger } from "../../utils/logger.js";

/**
 * Board API class for managing Jira Agile Boards
 */
export class BoardApi extends BaseJiraApi {
  /**
   * Get all boards visible to the user, optionally filtered by project or board type
   * @param projectKeyOrId Optional project key or ID to filter boards
   * @param boardType Optional board type filter ("scrum", "kanban")
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns List of boards
   */
  async getBoards(
    projectKeyOrId?: string,
    boardType?: string,
    maxResults: number = 50,
  ): Promise<any> {
    try {
      const params: any = {
        maxResults: maxResults,
      };

      if (projectKeyOrId) {
        params.projectKeyOrId = projectKeyOrId;
      }

      if (boardType) {
        params.type = boardType;
      }

      const response = await this.axiosInstance.get(
        "/rest/agile/1.0/board",
        { params },
      );

      const boards = response.data.values || [];

      return {
        total: response.data.total || boards.length,
        boards: boards.map((board: any) => ({
          id: board.id,
          name: board.name,
          type: board.type,
          self: board.self,
        })),
        _meta: {
          api_endpoint: `${this.BASE_URL}/rest/agile/1.0/board`,
          project_filter: projectKeyOrId || "all projects",
          board_type: boardType || "all types",
        },
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get board details by ID
   * @param boardId Board ID
   * @returns Board details
   */
  async getBoard(boardId: string): Promise<any> {
    try {
      const url = `/rest/agile/1.0/board/${boardId}`;
      logger.info(`[getBoard] Requesting URL: ${this.BASE_URL}${url}`);

      const response = await this.axiosInstance.get(url);

      logger.info(`[getBoard] Success: ${response.status}`);
      return {
        board: response.data,
        _meta: {
          api_endpoint: `${this.BASE_URL}${url}`,
          status: response.status,
        },
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get board configuration (columns, swimlanes, etc.)
   * @param boardId Board ID
   * @returns Board configuration
   */
  async getBoardConfiguration(boardId: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(
        `/rest/agile/1.0/board/${boardId}/configuration`,
      );

      return {
        configuration: response.data,
        _meta: {
          api_endpoint: `${this.BASE_URL}/rest/agile/1.0/board/${boardId}/configuration`,
        },
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get issues on a board
   * @param boardId Board ID
   * @param jql Optional additional JQL to filter issues
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns List of issues on the board
   */
  async getBoardIssues(
    boardId: string,
    jql?: string,
    maxResults: number = 50,
  ): Promise<any> {
    try {
      const params: any = {
        maxResults: maxResults,
      };

      if (jql) {
        params.jql = jql;
      }

      const response = await this.axiosInstance.get(
        `/rest/agile/1.0/board/${boardId}/issue`,
        { params },
      );

      const issues = response.data.issues || [];

      return {
        total: response.data.total || issues.length,
        issues: issues.map((issue: any) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          assignee: issue.fields.assignee?.displayName,
          priority: issue.fields.priority?.name,
          issueType: issue.fields.issuetype?.name,
        })),
        _meta: {
          api_endpoint: `${this.BASE_URL}/rest/agile/1.0/board/${boardId}/issue`,
          jql_filter: jql || "none",
        },
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get sprints for a specific board
   * @param boardId Board ID
   * @param state Optional state filter ("active", "closed", "future")
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns List of sprints on the board
   */
  async getBoardSprints(
    boardId: string,
    state?: string,
    maxResults: number = 50,
  ): Promise<any> {
    try {
      const params: any = {
        maxResults: maxResults,
      };

      if (state) {
        params.state = state;
      }

      const response = await this.axiosInstance.get(
        `/rest/agile/1.0/board/${boardId}/sprint`,
        { params },
      );

      const sprints = response.data.values || [];

      return {
        total: response.data.total || sprints.length,
        sprints: sprints.map((sprint: any) => ({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          completeDate: sprint.completeDate,
          goal: sprint.goal,
        })),
        _meta: {
          api_endpoint: `${this.BASE_URL}/rest/agile/1.0/board/${boardId}/sprint`,
          state_filter: state || "all",
        },
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get the active sprint for a board
   * @param boardId Board ID
   * @returns Active sprint details or null if none active
   */
  async getBoardActiveSprint(boardId: string): Promise<any> {
    try {
      const sprintsData = await this.getBoardSprints(boardId, "active", 10);

      const activeSprints = sprintsData.sprints.filter(
        (sprint: any) => sprint.state === "active",
      );

      if (activeSprints.length === 0) {
        return {
          activeSprint: null,
          message: "No active sprint found for this board",
          _meta: {
            boardId: boardId,
          },
        };
      }

      // Return the first active sprint (boards typically have one active sprint)
      return {
        activeSprint: activeSprints[0],
        _meta: {
          boardId: boardId,
          totalActiveSprintsFound: activeSprints.length,
        },
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Get current user's issues on a board, optionally filtered by sprint
   * @param boardId Board ID
   * @param sprintId Optional sprint ID (defaults to active sprint if not provided)
   * @param useActiveSprint Whether to auto-detect and use active sprint (default: true)
   * @param additionalJql Optional additional JQL filters
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns List of current user's issues
   */
  async getMyBoardIssues(
    boardId: string,
    sprintId?: number,
    useActiveSprint: boolean = true,
    additionalJql?: string,
    maxResults: number = 50,
  ): Promise<any> {
    try {
      const jqlParts: string[] = ["assignee = currentUser()"];
      let sprintInfo: any = null;

      // Determine which sprint to filter by
      if (sprintId) {
        // Explicit sprint ID provided
        jqlParts.push(`sprint = ${sprintId}`);
        sprintInfo = { id: sprintId, source: "explicit" };
      } else if (useActiveSprint) {
        // Auto-detect active sprint
        const activeSprintData = await this.getBoardActiveSprint(boardId);
        if (activeSprintData.activeSprint) {
          const activeSprintId = activeSprintData.activeSprint.id;
          jqlParts.push(`sprint = ${activeSprintId}`);
          sprintInfo = {
            id: activeSprintId,
            name: activeSprintData.activeSprint.name,
            source: "active_sprint_auto_detected",
          };
        } else {
          // No active sprint, don't filter by sprint
          sprintInfo = { message: "No active sprint, showing all board issues" };
        }
      }

      // Add any additional JQL
      if (additionalJql) {
        jqlParts.push(`(${additionalJql})`);
      }

      const jql = jqlParts.join(" AND ");

      // Use the existing getBoardIssues method
      const issuesData = await this.getBoardIssues(boardId, jql, maxResults);

      return {
        ...issuesData,
        _meta: {
          ...issuesData._meta,
          assignee: "currentUser()",
          sprint: sprintInfo,
          jql_used: jql,
        },
      };
    } catch (error) {
      this.handleApiError(error);
    }
  }
}
