/**
 * Type definitions for SAP Jira MCP
 */

// ============================================================================
// Cookie Storage Types
// ============================================================================

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface CookieStorage {
  cookies: StoredCookie[];
  timestamp: number;
  domain: string;
}

// ============================================================================
// Jira Configuration Types
// ============================================================================

/**
 * Jira template interface
 */
export interface JiraTemplate {
  summary: string;
  description: string;
  type: string;
  issuetype?: { id?: string } | any;
  assignee?: string;
  [key: string]: any;
}

/**
 * Jira project configuration interface
 */
export interface JiraProjectConfig {
  projectKey: string;
  create_issue_template: JiraTemplate[];
}

/**
 * Jira configuration interface
 */
export type JiraConfig = JiraProjectConfig | JiraProjectConfig[];

/**
 * Field mapping interface for human-readable field names
 */
export interface FieldMapping {
  [humanReadableName: string]: string; // Maps human-readable name to Jira field ID
}

// ============================================================================
// Jira Data Model Types
// ============================================================================

/**
 * Jira comment interface
 */
export interface JiraComment {
  id: string;
  body: string;
  created: string;
  author: {
    displayName: string;
  };
}

/**
 * Jira user interface
 */
export interface JiraUser {
  key: string;
  name: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
  timeZone: string;
}

/**
 * Jira issue interface
 */
export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    // Common fields that are always present
    summary: string;
    description: string;
    status: {
      name: string;
    };
    issuetype: {
      name: string;
      id?: string;
    };
    created: string;
    creator: {
      displayName: string;
    };
    assignee: {
      name: string;
      displayName?: string;
    };
    comment?: {
      comments: JiraComment[];
    };

    // Dynamic fields that can vary based on template
    [key: string]: any;
  };
}

// ============================================================================
// Jira API Request Types
// ============================================================================

/**
 * Create issue request interface
 */
export interface CreateIssueRequest {
  summary: string;
  description?: string;
  type?: string;
  assignee?: string;
  [key: string]: any;
}

/**
 * Update issue request interface
 */
export interface UpdateIssueRequest {
  issue_key: string;
  summary?: string;
  description?: string;
  status?: string;
  assignee?: string;
  [key: string]: any;
}

/**
 * Search issues request interface
 */
export interface SearchIssuesRequest {
  status?: string;
  assignee?: string;
  sprint?: string;
  additionalJql?: string;
  projectKey?: string;
}

/**
 * Get issue request interface
 */
export interface GetIssueRequest {
  issue_key: string;
}

/**
 * Delete issue request interface
 */
export interface DeleteIssueRequest {
  issue_key: string;
}

/**
 * Add comment request interface
 */
export interface AddCommentRequest {
  issue_key: string;
  comment: string;
}

/**
 * Get user info request interface
 */
export interface GetUserInfoRequest {
  username: string;
}

/**
 * Get transitions request interface
 */
export interface GetTransitionsRequest {
  issue_key: string;
}

/**
 * Update transition request interface
 */
export interface UpdateTransitionRequest {
  issue_key: string;
  transition_id: string;
  comment?: string;
}
