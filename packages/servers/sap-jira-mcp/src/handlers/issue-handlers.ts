/**
 * Issue-related Jira tool handlers
 * Includes: create_issue, update_issue, get_issue, delete_issue, search_issues
 */
import { z } from "zod";
import { HandlerContext } from "./types.js";
import { jiraCustomFields } from "./shared-schemas.js";
import { JiraApiService } from "../services/api/index.js";
import { JiraTemplate, CreateIssueRequest, JiraIssue } from "../types.js";
import { isEqualIgnoreCase } from "../utils/formatters.js";
import { textResponse } from "mcp-utils";
import { logger } from "../utils/logger.js";

// ============================================================================
// Type Definitions for Issue Handlers
// ============================================================================

/**
 * Jira field value with a 'value' property (commonly used for select fields)
 */
interface JiraValueField {
  value: string;
  child?: JiraValueField;
}

/**
 * Jira field value with a 'name' property (commonly used for components)
 */
interface JiraNameField {
  name: string;
}

/**
 * Jira field schema information
 */
interface JiraFieldSchema {
  type?: string;
  items?: string;
  system?: string;
  custom?: string;
  customId?: number;
}

/**
 * Jira field metadata from the API
 */
interface JiraFieldMetadata {
  fieldId: string;
  name?: string;
  required?: boolean;
  schema?: JiraFieldSchema;
  allowedValues?: JiraAllowedValue[];
}

/**
 * Allowed value option in field metadata
 */
interface JiraAllowedValue {
  id?: string;
  value?: string;
  name?: string;
  children?: JiraAllowedValue[];
}

/**
 * Information about a missing required field
 */
interface MissingFieldInfo {
  fieldId: string;
  fieldName: string;
  metadata: JiraFieldMetadata;
}

/**
 * Arguments for creating/updating issues
 */
interface IssueArgs extends Record<string, unknown> {
  summary?: string;
  description?: string;
  type?: string;
  projectKey?: string;
  issuetype?: { id: string };
}

/**
 * Extended JiraIssue with runtime metadata for formatting
 */
interface JiraIssueWithMetadata extends JiraIssue {
  _requestedFields?: string[];
  _template?: JiraTemplate;
}

// ============================================================================
// Type Guard Functions
// ============================================================================

/**
 * Type guard to check if value is an object with a 'value' property
 */
function isValueField(value: unknown): value is JiraValueField {
  return typeof value === "object" && value !== null && "value" in value;
}

/**
 * Type guard to check if value is an object with a 'name' property
 */
function isNameField(value: unknown): value is JiraNameField {
  return typeof value === "object" && value !== null && "name" in value;
}

/**
 * Type guard to check if value is a JiraFieldMetadata object
 */
function isFieldMetadata(value: unknown): value is JiraFieldMetadata {
  return typeof value === "object" && value !== null && "fieldId" in value;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a value is empty
 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value === "";
  }
  if (isValueField(value)) {
    return value.value === "";
  }
  if (isNameField(value)) {
    return value.name === "";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return true;
    }
    return value.every((item) => isEmptyValue(item));
  }
  return false;
}

/**
 * Extract a string value from various data types
 */
function extractStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isValueField(value)) {
    return String(value.value || "");
  }
  if (isNameField(value)) {
    return String(value.name || "");
  }
  if (Array.isArray(value) && value.length > 0) {
    const firstItem = value[0];
    if (isValueField(firstItem)) {
      return String(firstItem.value || "");
    }
    if (isNameField(firstItem)) {
      return String(firstItem.name || "");
    }
    return String(firstItem || "");
  }
  try {
    return String(value || "");
  } catch {
    return "";
  }
}

/**
 * Check if the template has required fields with missing values
 */
function checkRequiredFields(
  template: JiraTemplate,
  args: IssueArgs,
  fieldMetadata?: Record<string, unknown>
): MissingFieldInfo[] {
  const missingFields: MissingFieldInfo[] = [];
  const processedFieldIds = new Set<string>();

  if (!args.summary && !template.summary) {
    missingFields.push({
      fieldId: "summary",
      fieldName: "Summary",
      metadata: { fieldId: "summary", required: true, schema: { type: "string" } }
    });
    processedFieldIds.add("summary");
  }

  if (fieldMetadata) {
    for (const [fieldId, metadataValue] of Object.entries(fieldMetadata)) {
      if (!isFieldMetadata(metadataValue)) {
        continue;
      }
      const metadata = metadataValue;
      if (!metadata.fieldId || fieldId !== metadata.fieldId) {
        continue;
      }
      if (processedFieldIds.has(metadata.fieldId)) {
        continue;
      }
      if (["project", "issuetype", "summary"].includes(metadata.fieldId)) {
        continue;
      }
      if (metadata.required) {
        const fieldName = metadata.name || metadata.fieldId;
        const userProvidedValue =
          args[metadata.fieldId] ||
          args[fieldName] ||
          args[fieldName?.toLowerCase()];
        const templateValue =
          template[metadata.fieldId] ||
          template[fieldName] ||
          template[fieldName?.toLowerCase()];
        const isUserValueEmpty = isEmptyValue(userProvidedValue);
        const isTemplateValueEmpty = isEmptyValue(templateValue);
        if ((!userProvidedValue || isUserValueEmpty) && (!templateValue || isTemplateValueEmpty)) {
          missingFields.push({
            fieldId: metadata.fieldId,
            fieldName: fieldName,
            metadata: metadata
          });
          processedFieldIds.add(metadata.fieldId);
        }
      }
    }
  }
  return missingFields;
}

/**
 * Format field options for display to the user
 */
function formatFieldOptions(metadata: JiraFieldMetadata): string {
  let output = "";

  if (metadata.allowedValues && Array.isArray(metadata.allowedValues) && metadata.allowedValues.length > 0) {
    output += "**Available options:**\n";

    metadata.allowedValues.forEach((option: JiraAllowedValue, index: number) => {
      let optionText = "";

      if (typeof option === "string") {
        optionText = option;
      } else if (typeof option === "object" && option !== null) {
        if (option.value && option.name) {
          optionText = `${option.name} (value: "${option.value}")`;
        } else if (option.value) {
          optionText = option.value;
        } else if (option.name) {
          optionText = option.name;
        } else if (option.id) {
          optionText = `ID: ${option.id}`;
        } else {
          optionText = JSON.stringify(option);
        }

        if (option.children && Array.isArray(option.children) && option.children.length > 0) {
          const childOptions = option.children.map((child: JiraAllowedValue) => {
            if (child.value) return child.value;
            if (child.name) return child.name;
            return JSON.stringify(child);
          }).join(", ");
          optionText += `\n  -> Children: ${childOptions}`;
        }
      }

      output += `  ${index + 1}. ${optionText}\n`;
    });
  } else {
    output += "**Field type:** ";

    if (metadata.schema) {
      const schemaType = metadata.schema.type;
      const schemaItems = metadata.schema.items;

      if (schemaType === "array" && schemaItems) {
        output += `Array of ${schemaItems}`;

        if (schemaItems === "string") {
          output += '\n**Example:** ["value1", "value2"]';
        } else if (schemaItems === "option") {
          output += '\n**Example:** [{"value": "option1"}, {"value": "option2"}]';
        } else if (schemaItems === "component") {
          output += '\n**Example:** [{"name": "Component1"}, {"name": "Component2"}]';
        }
      } else if (schemaType === "string") {
        output += "String";
        output += '\n**Example:** "Your text here"';
      } else if (schemaType === "number" || schemaType === "integer") {
        output += schemaType.charAt(0).toUpperCase() + schemaType.slice(1);
        output += '\n**Example:** 123';
      } else if (schemaType === "option") {
        output += "Option";
        output += '\n**Example:** {"value": "option_value"}';
      } else if (schemaType === "user") {
        output += "User";
        output += '\n**Example:** {"name": "I123456"} (use inumber)';
      } else {
        output += schemaType || "Unknown";
      }
    } else {
      output += "Unknown (no schema information available)";
    }
  }

  return output;
}

/**
 * Process custom fields to match template structure
 * Returns a CreateIssueRequest-compatible object with processed fields
 */
function processCustomFields(args: IssueArgs, template: JiraTemplate): CreateIssueRequest {
  const processedArgs: Record<string, unknown> = { ...args };

  // Process all fields in the template first to extract any string values
  for (const [key, templateValue] of Object.entries(template)) {
    if (["summary", "description", "type", "issuetype", "assignee", "reporter"].includes(key)) {
      continue;
    }

    if (key.startsWith("customfield_") || !key.includes(" ")) {
      continue;
    }

    for (const [possibleKey, possibleValue] of Object.entries(template)) {
      if (possibleKey.startsWith("customfield_")) {
        const readableValue = extractStringValue(templateValue);
        const customValue = extractStringValue(possibleValue);
        if (readableValue && customValue && readableValue === customValue) {
          logger.debug(`Found potential field mapping: '${key}' -> '${possibleKey}'`);
        }
      }
    }

    const extractedValue = extractStringValue(templateValue);
    if (extractedValue) {
      if (!(key in processedArgs)) {
        processedArgs[key] = extractedValue;
      }
    }
  }

  // Process all fields in the template
  for (const [key, value] of Object.entries(template)) {
    if (["summary", "description", "type", "issuetype", "assignee"].includes(key)) {
      continue;
    }

    if (key in processedArgs) {
      const userValue = processedArgs[key];

      if (userValue === "") {
        delete processedArgs[key];
        continue;
      }

      if (typeof userValue === "object" && userValue !== null) {
        // Keep as is
      } else if (Array.isArray(value)) {
        if (typeof userValue === "string") {
          try {
            const parsedValue = JSON.parse(userValue);
            if (Array.isArray(parsedValue)) {
              processedArgs[key] = parsedValue;
            } else {
              processedArgs[key] = processArrayValue(value, userValue);
            }
          } catch {
            processedArgs[key] = processArrayValue(value, userValue);
          }
        }
      } else if (isValueField(value) && "child" in value) {
        processedArgs[key] = processChildValue(value, String(userValue));
      } else if (isValueField(value)) {
        if (typeof userValue === "string") {
          try {
            const parsedValue = JSON.parse(userValue) as unknown;
            if (typeof parsedValue === "object" && parsedValue !== null) {
              processedArgs[key] = parsedValue;
            } else {
              processedArgs[key] = { value: userValue };
            }
          } catch {
            processedArgs[key] = { value: userValue };
          }
        }
      } else if (isNameField(value)) {
        if (typeof userValue === "string") {
          try {
            const parsedValue = JSON.parse(userValue) as unknown;
            if (typeof parsedValue === "object" && parsedValue !== null) {
              processedArgs[key] = parsedValue;
            } else {
              processedArgs[key] = { name: userValue };
            }
          } catch {
            processedArgs[key] = { name: userValue };
          }
        }
      } else {
        if (typeof userValue === "string") {
          try {
            const parsedValue = JSON.parse(userValue) as unknown;
            processedArgs[key] = parsedValue;
          } catch {
            // Keep as is
          }
        }
      }
    } else {
      if (isEmptyValue(value)) {
        delete template[key];
      }
    }
  }

  // Process user-provided fields not in template
  for (const [key, value] of Object.entries(processedArgs)) {
    if (["summary", "description", "type", "issuetype", "assignee"].includes(key) || key in template) {
      continue;
    }

    if (value === "") {
      delete processedArgs[key];
      continue;
    }

    if (typeof value === "string") {
      try {
        const parsedValue = JSON.parse(value) as unknown;
        processedArgs[key] = parsedValue;
      } catch {
        if (value.includes(",")) {
          if (key.toLowerCase().includes("label") || key.toLowerCase().includes("tag") || key.toLowerCase().includes("component")) {
            const items = value.split(",").map((item) => item.trim()).filter((item) => item !== "");
            if (key.toLowerCase().includes("component")) {
              processedArgs[key] = items.map((item: string) => ({ name: item }));
            } else {
              processedArgs[key] = items;
            }
          }
        } else if (value.includes(" - ")) {
          if (key.toLowerCase().includes("type") || key.toLowerCase().includes("automation")) {
            const [parentValue, childValue] = value.split(" - ").map((part) => part.trim());
            processedArgs[key] = { value: parentValue, child: { value: childValue } };
          }
        } else if (key.startsWith("customfield_")) {
          processedArgs[key] = { value };
        }
      }
    }
  }

  // Cast to CreateIssueRequest since the object has the required structure
  // (summary is guaranteed to exist from either args or template)
  return processedArgs as CreateIssueRequest;
}

function processArrayValue(templateValue: unknown[], userValue: string): unknown {
  if (typeof userValue === "string" && userValue.includes(",")) {
    const items = userValue.split(",").map((item) => item.trim()).filter((item) => item !== "");
    if (templateValue.length > 0) {
      const firstItem = templateValue[0];
      if (isNameField(firstItem)) {
        return items.map((item) => ({ name: item }));
      } else if (isValueField(firstItem)) {
        return items.map((item) => ({ value: item }));
      }
    }
    return items;
  } else {
    if (templateValue.length > 0) {
      const firstItem = templateValue[0];
      if (isNameField(firstItem)) {
        return [{ name: userValue }];
      } else if (isValueField(firstItem)) {
        return [{ value: userValue }];
      }
    }
    return [userValue];
  }
}

function processChildValue(templateValue: JiraValueField, userValue: string): unknown {
  try {
    const parsedValue = JSON.parse(userValue) as unknown;
    if (typeof parsedValue === "object" && parsedValue !== null) {
      return parsedValue;
    }
  } catch {
    // Continue with string processing
  }

  if (typeof userValue === "string" && userValue.includes(" - ")) {
    const [parentValue, childValue] = userValue.split(" - ").map((part) => part.trim());
    return { value: parentValue, child: { value: childValue } };
  }

  if ("value" in templateValue) {
    return { value: userValue, child: { value: "" } };
  }

  return templateValue;
}

/**
 * Get template for a specific issue type
 */
async function getTemplateForType(type: string, templates: JiraTemplate[]): Promise<JiraTemplate> {
  const template = templates.find((t) => t.type.toLowerCase() === type.toLowerCase());
  if (!template) {
    logger.info(`No template found for issue type '${type}', creating minimal template`);
    return { type: type, summary: "", description: "" };
  }
  return template;
}

/**
 * Register issue-related tools
 */
export function registerIssueHandlers(context: HandlerContext): void {
  const {
    server,
    jiraDomain,
    authManager,
    configService,
    getJiraApiService,
    getFormatterService,
    getCurrentProjectKey,
    getTemplates,
    getDefaultTemplate,
    initializeServices,
  } = context;

  // Create Issue Tool
  const createIssueSchema = {
    summary: z.string().describe("Issue summary/title"),
    description: z.string().optional().describe("Issue description"),
    type: z.string().optional().describe("Issue type (Test, Epic, Story, Activity, Sub-Task)"),
    projectKey: z.string().optional().describe("Project key (e.g., MOB, WRK) to specify which project's template to use"),
    issuetype: z.object({ id: z.string() }).optional().describe("Issue type object with ID"),
    ...jiraCustomFields,
  };

  server.registerTool(
    "create_issue",
    {
      title: "Create Issue",
      description: "Create a new Jira issue",
      inputSchema: z.object(createIssueSchema).passthrough(),
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();
      const formatterService = getFormatterService();
      const currentProjectKey = getCurrentProjectKey();
      const templates = getTemplates();
      const defaultTemplate = getDefaultTemplate();

      if (!jiraApiService || !formatterService || !currentProjectKey || !templates || !defaultTemplate) {
        throw new Error("Services not initialized");
      }

      // Handle project-specific template logic
      if (args.projectKey) {
        const projectKey = await configService.loadProjectKey(args.projectKey);
        const projTemplates = await configService.loadCreateIssueTemplates(projectKey);
        const projDefaultTemplate = await configService.getDefaultTemplate(projectKey);

        const projJiraApiService = new JiraApiService(
          jiraDomain,
          projectKey,
          projTemplates,
          configService,
          authManager,
        );

        const type = args.type || projDefaultTemplate.type;
        let template = projTemplates.find((t) => t.type.toLowerCase() === type.toLowerCase());

        if (!template) {
          logger.info(`No template found for issue type '${type}' in project '${projectKey}', creating minimal template`);
          template = { type: type, summary: "", description: "" };
        }

        const issueTypeId = await projJiraApiService.getIssueTypeId(type);
        const fieldMetadata = await projJiraApiService.getFieldMetadata(issueTypeId);
        const missingFields = checkRequiredFields(template, args, fieldMetadata);

        if (missingFields.length > 0) {
          const fieldDetails = await Promise.all(
            missingFields.map(async (field) => {
              const options = formatFieldOptions(field.metadata);
              return `\n\n**${field.fieldName}** (${field.fieldId}):\n${options}`;
            })
          );
          throw new Error(
            `Missing required fields for issue type '${type}' in project '${projectKey}':${fieldDetails.join("")}\n\nPlease provide values for these fields and try again.`,
          );
        }

        const processedArgs = processCustomFields(args, template);
        delete processedArgs.projectKey;

        const createdIssue = await projJiraApiService.createIssue(processedArgs, template);
        return textResponse(formatterService.formatCreatedIssue(createdIssue));
      } else {
        // Handle default project logic
        const allProjectKeys = await configService.getAllProjectKeys();
        let foundTemplate = null;
        let foundProjectKey = null;

        if (args.type) {
          for (const projKey of allProjectKeys) {
            const projTemplates = await configService.loadCreateIssueTemplates(projKey);
            const matchingTemplate = projTemplates.find(
              (t) => args.type && t.type.toLowerCase() === args.type.toLowerCase(),
            );

            if (matchingTemplate) {
              foundTemplate = matchingTemplate;
              foundProjectKey = projKey;
              logger.debug(`Found template for type ${args.type} in project ${projKey}`);
              break;
            }
          }

          if (foundTemplate && foundProjectKey && foundProjectKey !== currentProjectKey) {
            logger.debug(`Using template from project ${foundProjectKey} for type ${args.type}`);

            const projJiraApiService = new JiraApiService(
              jiraDomain,
              foundProjectKey,
              await configService.loadCreateIssueTemplates(foundProjectKey),
              configService,
              authManager,
            );

            const issueTypeId = await projJiraApiService.getIssueTypeId(foundTemplate.type);
            const fieldMetadata = await projJiraApiService.getFieldMetadata(issueTypeId);
            const missingFields = checkRequiredFields(foundTemplate, args, fieldMetadata);

            if (missingFields.length > 0) {
              const fieldDetails = await Promise.all(
                missingFields.map(async (field) => {
                  const options = formatFieldOptions(field.metadata);
                  return `\n\n**${field.fieldName}** (${field.fieldId}):\n${options}`;
                })
              );
              throw new Error(
                `Missing required fields for issue type '${args.type}' in project '${foundProjectKey}':${fieldDetails.join("")}\n\nPlease provide values for these fields and try again.`,
              );
            }

            const processedArgs = processCustomFields(args, foundTemplate);
            const createdIssue = await projJiraApiService.createIssue(processedArgs, foundTemplate);
            return textResponse(formatterService.formatCreatedIssue(createdIssue));
          }
        }

        let type = args.type;
        let template;

        if (args.issuetype && args.issuetype.id) {
          const issueTypeId = args.issuetype.id;
          template = templates.find(
            (t) => t.issuetype && typeof t.issuetype === "object" && "id" in t.issuetype && t.issuetype.id === issueTypeId,
          );

          if (template) {
            type = template.type;
            logger.debug(`Found template for issuetype.id ${issueTypeId}: ${type}`);
          } else {
            template = defaultTemplate;
            type = template.type;
            logger.debug(`No template found for issuetype.id ${issueTypeId}, using default: ${type}`);
          }
        } else {
          type = type || defaultTemplate.type;
          template = await getTemplateForType(type, templates);
        }

        let issueTypeId: string;
        if (template.issuetype && typeof template.issuetype === "object" && "id" in template.issuetype) {
          issueTypeId = String(template.issuetype.id);
        } else {
          issueTypeId = await jiraApiService.getIssueTypeId(type);
        }

        const fieldMetadata = await jiraApiService.getFieldMetadata(issueTypeId);
        const missingFields = checkRequiredFields(template, args, fieldMetadata);

        if (missingFields.length > 0) {
          const fieldDetails = await Promise.all(
            missingFields.map(async (field) => {
              const options = formatFieldOptions(field.metadata);
              return `\n\n**${field.fieldName}** (${field.fieldId}):\n${options}`;
            })
          );
          throw new Error(
            `Missing required fields for issue type '${type}':${fieldDetails.join("")}\n\nPlease provide values for these fields and try again.`,
          );
        }

        const processedArgs = processCustomFields(args, template);
        const createdIssue = await jiraApiService.createIssue(processedArgs, template);
        return textResponse(formatterService.formatCreatedIssue(createdIssue));
      }
    },
  );

  // Search Issues Tool
  server.registerTool(
    "search_issues",
    {
      title: "Search Issues",
      description:
        "Search issues in the project with advanced filters including sprint support and flexible JQL extensions, before you build JQL, please learn examples from tool:jql_examples",
      inputSchema: {
        status: z.string().optional().describe('Filter by status (e.g., "Open", "To Do", "In Progress", "Done")'),
        assignee: z.string().optional().describe("Issue assignee(inumber),my"),
        sprint: z.string().optional().describe('Filter by sprint name or sprint ID (e.g., "Mobile 2508" or "297108")'),
        additionalJql: z.string().optional().describe('Additional JQL conditions to extend the search query (e.g., "(labels IS NOT EMPTY) OR (fixVersion IS NOT EMPTY)", "priority = High", "created >= -7d"), DON\'t put ORDER BY here'),
        projectKey: z.string().optional().describe('Project key to search in (e.g., "MOB", "WRK"). If not provided, searches across all projects.'),
      },
    },
    async (args) => {
      logger.info(`[search_issues] Tool called with args: ${JSON.stringify(args)}`);
      await initializeServices();

      const jiraApiService = getJiraApiService();
      const formatterService = getFormatterService();
      const currentProjectKey = getCurrentProjectKey();
      const defaultTemplate = getDefaultTemplate();

      if (!jiraApiService || !formatterService || !currentProjectKey || !defaultTemplate) {
        throw new Error("Services not initialized");
      }

      const { status, assignee, sprint, additionalJql, projectKey } = args;

      let resolvedAssignee = assignee;

      if (assignee) {
        if (isEqualIgnoreCase(assignee, "me") || isEqualIgnoreCase(assignee, "my") || isEqualIgnoreCase(assignee, "myself")) {
          resolvedAssignee = defaultTemplate.assignee;
        } else if (!/^I\d+$/.test(assignee)) {
          try {
            const users = await jiraApiService.getUserInfo({ username: assignee });
            if (users && users.length > 0) {
              resolvedAssignee = users[0].name;
              logger.debug(`Resolved username "${assignee}" to inumber "${resolvedAssignee}"`);
            } else {
              logger.info(`No user found for username "${assignee}", using as-is`);
              resolvedAssignee = assignee;
            }
          } catch (error) {
            logger.error(`Failed to resolve username "${assignee}":`, error);
            resolvedAssignee = assignee;
          }
        }
      }

      const issues = await jiraApiService.searchIssues({
        status,
        assignee: resolvedAssignee,
        sprint,
        additionalJql,
        projectKey,
      });

      const displayProjectKey = projectKey || currentProjectKey;
      return textResponse(formatterService.formatIssueList(issues, displayProjectKey));
    },
  );

  // Update Issue Tool
  const updateIssueSchema = {
    issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
    summary: z.string().optional().describe("New summary/title"),
    description: z.string().optional().describe("New description"),
    status: z.string().optional().describe("New status"),
    ...jiraCustomFields,
  };

  server.registerTool(
    "update_issue",
    {
      title: "Update Issue",
      description: "Update an existing issue",
      inputSchema: z.object(updateIssueSchema).passthrough(),
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();
      const formatterService = getFormatterService();

      if (!jiraApiService || !formatterService) {
        throw new Error("Services not initialized");
      }

      const updatedIssue = await jiraApiService.updateIssue(args);
      return textResponse(formatterService.formatIssue(updatedIssue));
    },
  );

  // Get Issue Tool
  server.registerTool(
    "get_issue",
    {
      title: "Get Issue",
      description: "Get details of a specific issue",
      inputSchema: {
        issue_key: z.string().describe("Issue key (e.g., MOB-123)"),
        fields: z.string().optional().describe("Comma-separated list of specific fields to display. If not provided, only template fields will be shown."),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();
      const formatterService = getFormatterService();
      const templates = getTemplates();

      if (!jiraApiService || !formatterService || !templates) {
        throw new Error("Services not initialized");
      }

      const issue = await jiraApiService.getIssue(args);

      // Augment issue with runtime metadata for the formatter
      const issueWithMetadata = issue as unknown as JiraIssueWithMetadata;

      if (args.fields) {
        issueWithMetadata._requestedFields = Array.isArray(args.fields)
          ? args.fields
          : typeof args.fields === "string"
            ? args.fields.split(",").map((f: string) => f.trim())
            : [];
      }

      const issueType = issue.fields?.issuetype?.name;
      if (issueType && templates) {
        const template = templates.find((t) => t.type.toLowerCase() === issueType.toLowerCase());
        if (template) {
          issueWithMetadata._template = template;
        }
      }

      return textResponse(formatterService.formatIssue(issueWithMetadata));
    },
  );

  // Delete Issue Tool
  server.registerTool(
    "delete_issue",
    {
      title: "Delete Issue",
      description: "Delete a Jira issue",
      inputSchema: {
        issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      await jiraApiService.deleteIssue(args);
      return textResponse(`Issue ${args.issue_key} has been deleted.`);
    },
  );
}
