/**
 * Jira API Service - Unified API class that composes all sub-APIs
 * Maintains backwards compatibility with the original JiraApiService
 */
import {
  JiraIssue,
  JiraUser,
  CreateIssueRequest,
  UpdateIssueRequest,
  SearchIssuesRequest,
  GetIssueRequest,
  DeleteIssueRequest,
  AddCommentRequest,
  GetUserInfoRequest,
  GetTransitionsRequest,
  UpdateTransitionRequest,
  DownloadAttachmentRequest,
  UploadAttachmentRequest,
  DeleteAttachmentRequest,
  JiraTemplate,
} from "../../types.js";
import { ConfigService } from "../config-service.js";
import { AuthManager } from "../auth-manager.js";
import { BaseJiraApi } from "./base.js";
import { FieldApi } from "./field-api.js";
import { UserApi } from "./user-api.js";
import { IssueApi } from "./issue-api.js";
import { SprintApi } from "./sprint-api.js";
import { TransitionApi } from "./transition-api.js";
import { CommentApi } from "./comment-api.js";
import { AttachmentApi } from "./attachment-api.js";
import { BoardApi } from "./board-api.js";
import { logger } from "../../utils/logger.js";

// Re-export all individual API classes for direct access if needed
export { BaseJiraApi } from "./base.js";
export { FieldApi } from "./field-api.js";
export { UserApi } from "./user-api.js";
export { IssueApi } from "./issue-api.js";
export { SprintApi } from "./sprint-api.js";
export { TransitionApi } from "./transition-api.js";
export { CommentApi } from "./comment-api.js";
export { AttachmentApi } from "./attachment-api.js";
export { BoardApi } from "./board-api.js";

/**
 * Unified Jira API Service class that composes all sub-APIs
 * Maintains backwards compatibility with the original JiraApiService
 */
export class JiraApiService {
  // Sub-API instances - share the same base configuration
  private fieldApi: FieldApi;
  private userApi: UserApi;
  private issueApi: IssueApi;
  private sprintApi: SprintApi;
  private transitionApi: TransitionApi;
  private commentApi: CommentApi;
  private attachmentApi: AttachmentApi;
  private boardApi: BoardApi;

  // Store configuration for direct access
  private jiraDomain: string;
  private projectKey: string;
  private templates: JiraTemplate[];
  private configService: ConfigService;
  private authManager: AuthManager;

  /**
   * Constructor - supports both API token and cookie authentication
   * @param jiraDomain Jira domain (e.g., "jira.tools.sap")
   * @param projectKey Jira project key
   * @param templates Jira issue templates
   * @param configService Configuration service
   * @param authManager auth manager for handling api token and cookies
   */
  constructor(
    jiraDomain: string,
    projectKey: string,
    templates: JiraTemplate[],
    configService: ConfigService,
    authManager: AuthManager,
  ) {
    this.jiraDomain = jiraDomain;
    this.projectKey = projectKey;
    this.templates = templates;
    this.configService = configService;
    this.authManager = authManager;

    // Initialize all sub-APIs with the same configuration
    this.fieldApi = new FieldApi(jiraDomain, projectKey, templates, configService, authManager);
    this.userApi = new UserApi(jiraDomain, projectKey, templates, configService, authManager);
    this.issueApi = new IssueApi(jiraDomain, projectKey, templates, configService, authManager);
    this.sprintApi = new SprintApi(jiraDomain, projectKey, templates, configService, authManager);
    this.transitionApi = new TransitionApi(jiraDomain, projectKey, templates, configService, authManager);
    this.commentApi = new CommentApi(jiraDomain, projectKey, templates, configService, authManager);
    this.attachmentApi = new AttachmentApi(jiraDomain, projectKey, templates, configService, authManager);
    this.boardApi = new BoardApi(jiraDomain, projectKey, templates, configService, authManager);

    // Wire up dependencies between APIs
    this.issueApi.setFieldApi(this.fieldApi);
    this.issueApi.setUserApi(this.userApi);
    this.issueApi.setSprintApi(this.sprintApi);
  }

  /**
   * Initialize the API service
   */
  async initialize(): Promise<any> {
    logger.info("[JiraApiService] Initializing API service");

    // Initialize the field API which handles field metadata
    await this.fieldApi.initializeFieldMetadata();

    // Share the field caches across all APIs
    this.syncFieldCaches();

    logger.info("[JiraApiService] API service initialization completed");
  }

  /**
   * Sync field caches across all API instances
   */
  private syncFieldCaches(): void {
    // Get caches from field API
    const allFieldsCache = this.fieldApi.getAllFieldsCache();
    const fieldNameToIdMap = this.fieldApi.getFieldNameToIdMap();
    const fieldIdToNameMap = this.fieldApi.getFieldIdToNameMap();
    const fieldMetadataCache = this.fieldApi.getFieldMetadataCache();

    // Sync to all other APIs
    const apis = [this.userApi, this.issueApi, this.sprintApi, this.transitionApi, this.commentApi, this.attachmentApi, this.boardApi];
    for (const api of apis) {
      api.setAllFieldsCache(allFieldsCache);
      for (const [name, id] of Object.entries(fieldNameToIdMap)) {
        api.setFieldNameToIdMap(name, id);
      }
      for (const [id, name] of Object.entries(fieldIdToNameMap)) {
        api.setFieldIdToNameMap(id, name);
      }
      for (const [key, value] of Object.entries(fieldMetadataCache)) {
        api.setFieldMetadataCache(key, value);
      }
    }
  }

  // ============================================================================
  // Issue Operations (delegated to IssueApi)
  // ============================================================================

  /**
   * Create a new issue
   * @param request Create issue request
   * @param template Template to use for the issue
   * @returns Created issue
   */
  async createIssue(request: CreateIssueRequest, template: JiraTemplate): Promise<any> {
    return this.issueApi.createIssue(request, template);
  }

  /**
   * Update an existing issue
   * @param request Update issue request
   * @returns Updated issue
   */
  async updateIssue(request: UpdateIssueRequest): Promise<JiraIssue> {
    return this.issueApi.updateIssue(request);
  }

  /**
   * Get an issue by key
   * @param request Get issue request
   * @returns Issue
   */
  async getIssue(request: GetIssueRequest): Promise<JiraIssue> {
    return this.issueApi.getIssue(request);
  }

  /**
   * Delete an issue
   * @param request Delete issue request
   */
  async deleteIssue(request: DeleteIssueRequest): Promise<void> {
    return this.issueApi.deleteIssue(request);
  }

  /**
   * Search issues with advanced filters including sprint support
   * @param request Search issues request
   * @returns List of issues
   */
  async searchIssues(request: SearchIssuesRequest): Promise<JiraIssue[]> {
    return this.issueApi.searchIssues(request);
  }

  /**
   * Get JQL examples with dynamic SAP Jira metadata
   */
  async getJqlExamples(): Promise<{
    examples: Array<{
      title: string;
      jql: string;
      description: string;
    }>;
    metadata: {
      topProjects: string[];
      commonStatuses: string[];
      priorities: string[];
      issueTypes: string[];
      customFields: Array<{ id: string; name: string }>;
      currentUser: string;
    };
  }> {
    return this.issueApi.getJqlExamples();
  }

  // ============================================================================
  // User Operations (delegated to UserApi)
  // ============================================================================

  /**
   * Get current logged-in user
   * @returns Current user information
   */
  async getCurrentUser(): Promise<any> {
    return this.userApi.getCurrentUser();
  }

  /**
   * Get user information
   * @param request Get user info request
   * @returns User information
   */
  async getUserInfo(request: GetUserInfoRequest): Promise<JiraUser[]> {
    return this.userApi.getUserInfo(request);
  }

  // ============================================================================
  // Field Operations (delegated to FieldApi)
  // ============================================================================

  /**
   * Get issue type ID from project
   * @param typeName Issue type name
   * @returns Issue type ID
   */
  async getIssueTypeId(typeName: string): Promise<string> {
    return this.fieldApi.getIssueTypeId(typeName);
  }

  /**
   * Get field metadata for an issue type
   * @param issueTypeId Issue type ID
   * @returns Field metadata
   */
  async getFieldMetadata(issueTypeId: string): Promise<Record<string, any>> {
    return this.fieldApi.getFieldMetadata(issueTypeId);
  }

  /**
   * Get field metadata by ID
   * @param fieldId Field ID
   * @returns Field metadata
   */
  async getFieldMetadataById(fieldId: string): Promise<any> {
    return this.fieldApi.getFieldMetadataById(fieldId);
  }

  /**
   * Get field metadata by field names for a specific issue type
   * @param fieldNames Field names (can be comma-separated)
   * @param issueTypeId Issue type ID
   * @param projectKey Project key (optional, defaults to current project)
   * @returns Field metadata for the specified fields
   */
  async getFieldMetadataByName(
    fieldNames: string,
    issueTypeId: string,
    projectKey?: string,
  ): Promise<any> {
    return this.fieldApi.getFieldMetadataByName(fieldNames, issueTypeId, projectKey);
  }

  // ============================================================================
  // Sprint Operations (delegated to SprintApi)
  // ============================================================================

  /**
   * Get sprint values for a specific issue
   * @param issueKey Issue key (e.g., MOB-123)
   * @returns Sprint values set for the issue
   */
  async getIssueSprintValues(issueKey: string): Promise<any> {
    return this.sprintApi.getIssueSprintValues(issueKey);
  }

  /**
   * Get sprint values for a specific project
   * @param projectKey Project key (e.g., MOB, WRK)
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns All available sprint values for the project
   */
  async getProjectSprintValues(projectKey: string, maxResults: number = 50): Promise<any> {
    return this.sprintApi.getProjectSprintValues(projectKey, maxResults);
  }

  /**
   * Update issue sprint using Agile API
   * @param issueKey Issue key (e.g., MOB-123)
   * @param sprintId Target sprint ID
   * @returns Success status
   */
  async updateIssueSprint(issueKey: string, sprintId: number): Promise<any> {
    return this.sprintApi.updateIssueSprint(issueKey, sprintId);
  }

  // ============================================================================
  // Transition Operations (delegated to TransitionApi)
  // ============================================================================

  /**
   * Get available transitions for an issue
   * @param request Get transitions request
   * @returns Available transitions for the issue
   */
  async getTransitions(request: GetTransitionsRequest): Promise<any> {
    return this.transitionApi.getTransitions(request);
  }

  /**
   * Update transition (change status) for an issue
   * @param request Update transition request
   * @returns Response from the API
   */
  async updateTransition(request: UpdateTransitionRequest): Promise<any> {
    return this.transitionApi.updateTransition(request);
  }

  // ============================================================================
  // Comment Operations (delegated to CommentApi)
  // ============================================================================

  /**
   * Add a comment to an issue
   * @param request Add comment request
   */
  async addComment(request: AddCommentRequest): Promise<void> {
    return this.commentApi.addComment(request);
  }

  /**
   * Delete a comment from an issue
   * @param issueKey Issue key
   * @param commentId Comment ID to delete
   */
  async deleteComment(issueKey: string, commentId: string): Promise<void> {
    return this.commentApi.deleteComment(issueKey, commentId);
  }

  // ============================================================================
  // Attachment Operations (delegated to AttachmentApi)
  // ============================================================================

  /**
   * Download attachments from an issue
   * @param request Download attachment request
   * @returns Downloaded attachments with base64-encoded content
   */
  async downloadAttachment(request: DownloadAttachmentRequest): Promise<{
    issue_key: string;
    attachments: Array<{
      id: string;
      filename: string;
      size: number;
      mimeType: string;
      content: string;
      downloaded: boolean;
      saved: boolean;
    }>;
    count: number;
  }> {
    return this.attachmentApi.downloadAttachment(request);
  }

  /**
   * Upload one or more attachments to a Jira issue
   * @param request Upload attachment request
   * @returns Array of created attachment objects
   */
  async uploadAttachment(request: UploadAttachmentRequest): Promise<Array<{
    id: string;
    filename: string;
    size: number;
    mimeType: string;
    content: string;
  }>> {
    return this.attachmentApi.uploadAttachment(request);
  }

  /**
   * Delete an attachment from Jira
   * @param request Delete attachment request
   */
  async deleteAttachment(request: DeleteAttachmentRequest): Promise<void> {
    return this.attachmentApi.deleteAttachment(request);
  }

  // ============================================================================
  // Board Operations (delegated to BoardApi)
  // ============================================================================

  /**
   * Get all boards visible to the user
   * @param projectKeyOrId Optional project key or ID to filter boards
   * @param boardType Optional board type filter ("scrum", "kanban")
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns List of boards
   */
  async getBoards(projectKeyOrId?: string, boardType?: string, maxResults?: number): Promise<any> {
    return this.boardApi.getBoards(projectKeyOrId, boardType, maxResults);
  }

  /**
   * Get board details by ID
   * @param boardId Board ID
   * @returns Board details
   */
  async getBoard(boardId: string): Promise<any> {
    return this.boardApi.getBoard(boardId);
  }

  /**
   * Get board configuration (columns, swimlanes, etc.)
   * @param boardId Board ID
   * @returns Board configuration
   */
  async getBoardConfiguration(boardId: string): Promise<any> {
    return this.boardApi.getBoardConfiguration(boardId);
  }

  /**
   * Get issues on a board
   * @param boardId Board ID
   * @param jql Optional additional JQL to filter issues
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns List of issues on the board
   */
  async getBoardIssues(boardId: string, jql?: string, maxResults?: number): Promise<any> {
    return this.boardApi.getBoardIssues(boardId, jql, maxResults);
  }

  /**
   * Get sprints for a specific board
   * @param boardId Board ID
   * @param state Optional state filter ("active", "closed", "future")
   * @param maxResults Maximum number of results to return (default: 50)
   * @returns List of sprints on the board
   */
  async getBoardSprints(boardId: string, state?: string, maxResults?: number): Promise<any> {
    return this.boardApi.getBoardSprints(boardId, state, maxResults);
  }

  /**
   * Get the active sprint for a board
   * @param boardId Board ID
   * @returns Active sprint details or null if none active
   */
  async getBoardActiveSprint(boardId: string): Promise<any> {
    return this.boardApi.getBoardActiveSprint(boardId);
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
    useActiveSprint?: boolean,
    additionalJql?: string,
    maxResults?: number,
  ): Promise<any> {
    return this.boardApi.getMyBoardIssues(boardId, sprintId, useActiveSprint, additionalJql, maxResults);
  }
}
