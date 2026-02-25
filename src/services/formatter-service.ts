/**
 * Formatter service for Jira data
 */
import { JiraIssue, JiraUser } from "../models/types.js";
import { formatDate } from "../utils/formatters.js";
import { ConfigService } from "./config-service.js";

import { logger } from "../utils/logger.js";
/**
 * Formatter service class
 */
export class FormatterService {
  private jiraDomain: string;
  private configService: ConfigService;

  /**
   * Constructor
   * @param jiraDomain Jira domain
   * @param configService Configuration service
   */
  constructor(jiraDomain: string, configService: ConfigService) {
    this.jiraDomain = jiraDomain;
    this.configService = configService;
  }

  /**
   * Format an issue for display
   * @param issue Jira issue
   * @returns Formatted issue string
   */
  formatIssue(issue: JiraIssue): string {
    try {
      // Safely access fields with error handling
      const summary = issue.fields?.summary || "No summary";
      const issueTypeName = issue.fields?.issuetype?.name || "Unknown type";
      const statusName = issue.fields?.status?.name || "Unknown status";
      const created = issue.fields?.created
        ? formatDate(issue.fields.created)
        : "Unknown date";
      const description = issue.fields?.description || "No description";
      const creatorName =
        issue.fields?.creator?.displayName || "Unknown creator";
      const assigneeName =
        issue.fields?.assignee?.name ||
        issue.fields?.assignee?.displayName ||
        "Unassigned";

      // Start with common fields
      let output = `${issue.key}: ${summary}
- Type: ${issueTypeName}
- Status: ${statusName}
- Created: ${created}
- Description: ${description}
- Creator: ${creatorName}
- Assignee: ${assigneeName}`;

      // Add dynamic fields based on template configuration
      // Exclude common fields and internal fields that start with underscore
      const commonFields = [
        "summary",
        "description",
        "issuetype",
        "status",
        "created",
        "creator",
        "assignee",
        "comment",
      ];

      try {
        // Get the template for this issue type
        const template = (issue as any)._template;

        // Check if specific fields were requested
        const requestedFields = (issue as any)._requestedFields || [];
        const hasSpecificFieldsRequested =
          Array.isArray(requestedFields) && requestedFields.length > 0;

        // Determine which fields to display
        let fieldsToDisplay: string[] = [];

        if (hasSpecificFieldsRequested) {
          // If specific fields were requested, only display those
          logger.info("Specific fields requested:", requestedFields);
          fieldsToDisplay = requestedFields;
        } else if (template) {
          // If no specific fields requested but we have a template, use its fields
          const templateFields = Object.keys(template).filter(
            (key) =>
              !commonFields.includes(key) &&
              !key.startsWith("_") &&
              key !== "type",
          );

          // Log template fields
          logger.info("Template fields:", templateFields);

          // Add all fields from the template
          fieldsToDisplay = [...templateFields];

          // Add standard fields that should always be displayed
          const standardFields = [
            "labels",
            "components",
            "priority",
            "customfield_12740",
            "fixVersions",
            "versions",
            "customfield_15140",
            "customfield_43742",
            "customfield_43743",
          ];
          fieldsToDisplay = [
            ...new Set([...fieldsToDisplay, ...standardFields]),
          ];
        } else {
          // If no template and no specific fields requested, display all fields with values
          fieldsToDisplay = Object.keys(issue.fields || {}).filter(
            (key) => !commonFields.includes(key) && !key.startsWith("_"),
          );
        }

        // Log fields to display
        logger.info("Fields to display:", fieldsToDisplay);

        // Log all available fields in the issue
        logger.info("All fields in issue:", Object.keys(issue.fields || {}));

        // Sort field names for consistent display
        fieldsToDisplay.sort();

        // Define standard fields that should show empty values when null
        const standardFields = [
          "labels",
          "components",
          "priority",
          "customfield_12740",
          "fixVersions",
          "versions",
          "customfield_15140",
          "customfield_43742",
          "customfield_43743",
        ];

        // Format and add each field
        for (const key of fieldsToDisplay) {
          try {
            const value = issue.fields[key];

            // Handle null or undefined values
            if (value === null || value === undefined) {
              // For standard fields, show appropriate empty type instead of skipping
              if (standardFields.includes(key)) {
                // Determine the appropriate empty value based on field type
                let emptyValue = "";
                if (
                  key === "labels" ||
                  key === "components" ||
                  key === "fixVersions" ||
                  key === "versions"
                ) {
                  emptyValue = "[]"; // Array fields get empty array
                } else if (key === "priority") {
                  emptyValue = "None"; // Priority gets "None"
                } else {
                  emptyValue = "None"; // Other fields get "None"
                }
                output += `\n- ${this.formatFieldName(key)}: ${emptyValue}`;
              }
              continue;
            }

            // Format the field value based on its type
            if (typeof value === "object") {
              if (value === null) {
                continue;
              } else if ("name" in value && value.name) {
                output += `\n- ${this.formatFieldName(key)}: ${value.name}`;
              } else if ("value" in value && value.value !== undefined) {
                output += `\n- ${this.formatFieldName(key)}: ${value.value}`;
                // Handle nested child if present
                if (
                  value.child &&
                  typeof value.child === "object" &&
                  value.child.value !== undefined
                ) {
                  output += ` > ${value.child.value}`;
                }
              } else if (Array.isArray(value)) {
                // Handle array values (like labels, components)
                try {
                  const formattedArray = value
                    .map((item: any) => {
                      if (item === null || item === undefined) return "";
                      if (typeof item === "string") return item;
                      if (typeof item === "object") {
                        if (item.value !== undefined) return item.value;
                        if (item.name !== undefined) return item.name;
                      }
                      return JSON.stringify(item);
                    })
                    .filter(Boolean)
                    .join(", ");

                  if (formattedArray) {
                    output += `\n- ${this.formatFieldName(key)}: ${formattedArray}`;
                  }
                } catch (arrayError) {
                  logger.error(
                    `Error formatting array field ${key}:`,
                    arrayError,
                  );
                  output += `\n- ${this.formatFieldName(key)}: [Error formatting array]`;
                }
              } else {
                // For other complex objects, stringify them
                try {
                  const stringValue = JSON.stringify(value);
                  if (stringValue !== "{}") {
                    output += `\n- ${this.formatFieldName(key)}: ${stringValue}`;
                  }
                } catch (jsonError) {
                  logger.error(`Error stringifying field ${key}:`, jsonError);
                  output += `\n- ${this.formatFieldName(key)}: [Complex object]`;
                }
              }
            } else {
              // For simple values (strings, numbers, booleans)
              output += `\n- ${this.formatFieldName(key)}: ${value}`;
            }
          } catch (fieldError) {
            logger.error(`Error processing field ${key}:`, fieldError);
            output += `\n- ${this.formatFieldName(key)}: [Error processing field]`;
          }
        }
      } catch (fieldsError) {
        logger.error("Error processing fields:", fieldsError);
        output += "\n[Error processing additional fields]";
      }

      // Add comments if present
      try {
        const comments = issue.fields?.comment?.comments;
        if (comments && Array.isArray(comments) && comments.length > 0) {
          output += "\n\nComments:";
          comments.forEach((comment) => {
            try {
              const commentDate = comment.created
                ? formatDate(comment.created)
                : "Unknown date";
              const authorName =
                comment.author?.displayName || "Unknown author";
              const commentBody = comment.body || "No content";

              output += `\n\n[${commentDate} by ${authorName}]\n${commentBody}`;
            } catch (commentError) {
              logger.error("Error formatting comment:", commentError);
              output += "\n\n[Error formatting comment]";
            }
          });
        }
      } catch (commentsError) {
        logger.error("Error processing comments:", commentsError);
        output += "\n\n[Error processing comments]";
      }

      return output;
    } catch (error) {
      logger.error("Error formatting issue:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Error formatting issue ${issue?.key || "unknown"}: ${errorMessage}`;
    }
  }

  /**
   * Format a list of issues for display
   * @param issues List of Jira issues
   * @param projectKey Project key (optional, used as fallback)
   * @returns Formatted issue list string
   */
  formatIssueList(issues: JiraIssue[], projectKey?: string): string {
    try {
      if (!Array.isArray(issues) || issues.length === 0) {
        return "No issues found.";
      }

      // Extract unique project keys from the actual issues
      const projectKeys = new Set<string>();
      issues.forEach((issue) => {
        if (issue.key) {
          const projectFromKey = issue.key.split("-")[0];
          if (projectFromKey) {
            projectKeys.add(projectFromKey);
          }
        }
      });

      // Determine the header text based on actual projects found
      let headerText = "Latest Jira Issues";
      if (projectKeys.size === 1) {
        headerText += ` in ${Array.from(projectKeys)[0]} Project`;
      } else if (projectKeys.size > 1) {
        headerText += ` across ${Array.from(projectKeys).join(", ")} Projects`;
      } else if (projectKey) {
        // Fallback to provided projectKey if we couldn't extract from issues
        headerText += ` in ${projectKey} Project`;
      }

      const formattedIssues = issues
        .map((issue) => {
          try {
            return `https://${this.jiraDomain}/browse/${issue.key}`;
          } catch (error) {
            logger.error("Error formatting issue in list:", error);
            return "[Error formatting issue]";
          }
        })
        .join("\n");
      return `${headerText}:\n\n${formattedIssues}\n\nTotal Issues: ${issues.length}`;
    } catch (error) {
      logger.error("Error formatting issue list:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Error formatting issue list: ${errorMessage}`;
    }
  }

  /**
   * Format a created issue for display
   * @param issue Created issue data
   * @returns Formatted created issue string
   */
  formatCreatedIssue(issue: any): string {
    try {
      const issueKey = issue?.key || "unknown";
      return `Issue created successfully:
- Key: ${issueKey}
- URL: https://${this.jiraDomain}/browse/${issueKey}`;
    } catch (error) {
      logger.error("Error formatting created issue:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Issue created successfully, but error formatting response: ${errorMessage}`;
    }
  }

  /**
   * Format user details for display
   * @param users List of Jira users
   * @returns Formatted user details string
   */
  formatUserDetails(users: JiraUser[]): string {
    try {
      if (!Array.isArray(users) || users.length === 0) {
        return "No users found.";
      }

      return users
        .map((user) => {
          try {
            const displayName = user?.displayName || "Unknown";
            const name = user?.name || "Unknown";
            const emailAddress = user?.emailAddress || "Unknown";
            const active = user?.active !== undefined ? user.active : "Unknown";
            const timeZone = user?.timeZone || "Unknown";

            return `- displayName: ${displayName}\n  name: ${name}\n  emailAddress: ${emailAddress}\n  active: ${active}\n  timeZone: ${timeZone}`;
          } catch (userError) {
            logger.error("Error formatting user:", userError);
            return "- [Error formatting user]";
          }
        })
        .join("\n\n");
    } catch (error) {
      logger.error("Error formatting user details:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Error formatting user details: ${errorMessage}`;
    }
  }

  /**
   * Format user ID for display
   * @param users List of Jira users
   * @returns Formatted user ID string
   */
  formatUserId(users: JiraUser[]): string {
    try {
      if (!Array.isArray(users) || users.length === 0) {
        return "No users found.";
      }
      return users[0]?.name || "Unknown user";
    } catch (error) {
      logger.error("Error formatting user ID:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Error formatting user ID: ${errorMessage}`;
    }
  }

  /**
   * Format field name for display
   * @param key Field key
   * @returns Formatted field name
   */
  private formatFieldName(key: string): string {
    // Use the configService to map field IDs to human-readable names
    if (key.startsWith("customfield_")) {
      return this.configService.mapFieldIdToName(key);
    }

    // Format regular field names by capitalizing each word
    return key
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
}
