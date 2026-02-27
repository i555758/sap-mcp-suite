/**
 * Field-related Jira tool handlers
 * Includes: get_field_metadata, get_field_metadata_by_name, get_required_fields_structure, get_project_issue_types
 */
import { z } from "zod";
import { HandlerContext } from "./types.js";
import { JiraApiService } from "../services/api/index.js";
import { jsonResponse, extractErrorMessage } from "mcp-utils";
import { logger } from "../utils/logger.js";

/**
 * Register field-related tools
 */
export function registerFieldHandlers(context: HandlerContext): void {
  const {
    server,
    jiraDomain,
    authManager,
    configService,
    getJiraApiService,
    getTemplates,
    initializeServices,
  } = context;

  /**
   * Get the required fields structure for creating a ticket of a specific type in a project
   */
  async function getRequiredFieldsStructure(
    projectKey: string,
    type: string,
    args?: any,
  ): Promise<any> {
    try {
      await initializeServices();

      const templates = getTemplates();

      const jiraApiService = new JiraApiService(
        jiraDomain,
        projectKey,
        templates || [],
        configService,
        authManager,
      );

      let issueTypeId: string;
      try {
        issueTypeId = await jiraApiService.getIssueTypeId(type);
      } catch (error) {
        throw new Error(`Issue type '${type}' not found in project '${projectKey}'`);
      }

      const fieldMetadata = await jiraApiService.getFieldMetadata(issueTypeId);

      const fieldsStructure: any = {
        type: type,
        issuetype: { id: issueTypeId },
        project: { key: projectKey },
        _meta: {
          api_endpoint: `https://${jiraDomain}/rest/api/2/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`,
        },
      };

      for (const [fieldId, metadata] of Object.entries(fieldMetadata)) {
        if (typeof metadata === "object" && metadata !== null && metadata.required) {
          if (["project", "issuetype"].includes(fieldId)) {
            continue;
          }

          const fieldName = metadata.name;
          fieldsStructure[fieldId] = { name: fieldName, required: true };

          if (fieldName && typeof fieldName === "string") {
            fieldsStructure[fieldName] = { name: fieldName, required: true };
            fieldsStructure[fieldName.toLowerCase()] = { name: fieldName, required: true };
          }
        }
      }

      if (args) {
        for (const [key, value] of Object.entries(args)) {
          if (key in fieldsStructure || key === "projectKey" || key === "type") {
            continue;
          }

          for (const [fieldId, metadata] of Object.entries(fieldMetadata)) {
            if (typeof metadata === "object" && metadata !== null) {
              const fieldName = metadata.name;

              if (
                fieldId === key ||
                (fieldName && typeof fieldName === "string" && fieldName.toLowerCase() === key.toLowerCase())
              ) {
                fieldsStructure[fieldId] = { name: fieldName, required: false };

                if (fieldName && typeof fieldName === "string") {
                  fieldsStructure[fieldName] = { name: fieldName, required: false };
                  fieldsStructure[fieldName.toLowerCase()] = { name: fieldName, required: false };
                }

                break;
              }
            }
          }
        }
      }

      return fieldsStructure;
    } catch (error) {
      throw new Error(extractErrorMessage(error));
    }
  }

  /**
   * Get issue types for a project
   */
  async function getProjectIssueTypes(projectKey: string): Promise<any> {
    try {
      await initializeServices();

      const templates = getTemplates();

      const jiraApiService = new JiraApiService(
        jiraDomain,
        projectKey,
        templates || [],
        configService,
        authManager,
      );

      const apiUrl = `https://${jiraDomain}/rest/api/2/issue/createmeta/${projectKey}/issuetypes`;
      logger.debug(`Fetching issue types from: ${apiUrl}`);

      try {
        await jiraApiService.getIssueTypeId("dummy_type_to_get_all_types");
      } catch (error) {
        if (error instanceof Error && error.message.includes("Available types:")) {
          const typesString = error.message.split("Available types:")[1].trim();
          const types = typesString.split(", ").map((type) => type.trim());

          return {
            values: types.map((type) => ({ name: type })),
            _meta: { api_endpoint: apiUrl },
          };
        }
      }

      return {
        values: [],
        _meta: { api_endpoint: apiUrl },
      };
    } catch (error) {
      throw new Error(extractErrorMessage(error));
    }
  }

  // Get Field Metadata Tool
  server.registerTool(
    "get_field_metadata",
    {
      title: "Get Field Metadata",
      description: "Get metadata for a specific field",
      inputSchema: {
        field_id: z.string().describe("Field ID (e.g., customfield_10006)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const fieldMetadata = await jiraApiService.getFieldMetadataById(args.field_id);
      return jsonResponse(fieldMetadata);
    },
  );

  // Get Required Fields Structure Tool
  server.registerTool(
    "get_required_fields_structure",
    {
      title: "Get Required Fields Structure",
      description: "Get the required fields structure for creating a ticket of a specific type in a project",
      inputSchema: {
        projectKey: z.string().describe("Project key (e.g., MOB, WRK)"),
        type: z.string().describe("Issue type (e.g., Test, Epic, Story, Activity, Task, Sub-Task)"),
      },
    },
    async (args) => {
      const fieldsStructure = await getRequiredFieldsStructure(args.projectKey, args.type, args);
      return jsonResponse(fieldsStructure);
    },
  );

  // Get Project Issue Types Tool
  server.registerTool(
    "get_project_issue_types",
    {
      title: "Get Project Issue Types",
      description: "Get all issue types for a project",
      inputSchema: {
        projectKey: z.string().describe("Project key (e.g., MOB, WRK)"),
      },
    },
    async (args) => {
      const issueTypes = await getProjectIssueTypes(args.projectKey);
      return jsonResponse(issueTypes);
    },
  );

  // Get Field Metadata By Name Tool
  server.registerTool(
    "get_field_metadata_by_name",
    {
      title: "Get Field Metadata By Name",
      description: "Get field metadata by field names for a specific issue type in a project",
      inputSchema: {
        fieldNames: z.string().describe("Field names - can be a single field name or comma-separated multiple field names (e.g., 'Sprint' or 'Sprint,Epic Name,Test Automation Type')"),
        issueTypeId: z.string().describe("Issue type ID (e.g., '10500')"),
        projectKey: z.string().optional().describe("Project key (e.g., MOB, WRK). If not provided, defaults to the first project in jira-config.json"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const fieldMetadata = await jiraApiService.getFieldMetadataByName(
        args.fieldNames,
        args.issueTypeId,
        args.projectKey,
      );
      return jsonResponse(fieldMetadata);
    },
  );
}
