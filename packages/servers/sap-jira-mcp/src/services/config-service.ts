/**
 * Configuration service for Jira
 */
import fs from "fs";
import path from "path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../utils/logger.js";
import {
  JiraConfig,
  JiraProjectConfig,
  JiraTemplate,
  FieldMapping,
} from "../types.js";
import { extractErrorMessage } from "mcp-utils";

/**
 * Configuration service class
 */
export class ConfigService {
  private configPath: string;

  /**
   * Constructor
   * @param configPath Optional configuration path (defaults to current working directory)
   */
  constructor(configPath?: string) {
    this.configPath = configPath || process.cwd();
  }

  /**
   * Load project key from configuration file
   * @param projectKey Optional project key to load (defaults to first project)
   * @returns Project key
   */
  async loadProjectKey(projectKey?: string): Promise<string> {
    try {
      const configs = await this.loadProjectConfigs(this.configPath);

      // If a specific project key is provided, find that project
      if (projectKey) {
        const config = configs.find((c) => c.projectKey === projectKey);
        if (!config) {
          // Instead of throwing an error, return the provided project key
          // This allows creating tickets in projects not configured in .jira-config.json
          logger.error(
            `Project key '${projectKey}' not found in .jira-config.json, but will proceed with it`,
          );
          return projectKey;
        }
        return config.projectKey;
      }

      // Otherwise, return the first project key as default
      if (configs.length === 0 || !configs[0].projectKey) {
        throw new Error("No project keys found in .jira-config.json");
      }

      // Default to the first project in the array
      return configs[0].projectKey;
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        extractErrorMessage(error),
      );
    }
  }

  /**
   * Get all available project keys
   * @returns Array of project keys
   */
  async getAllProjectKeys(): Promise<string[]> {
    try {
      const configs = await this.loadProjectConfigs(this.configPath);
      return configs.map((config) => config.projectKey);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        extractErrorMessage(error),
      );
    }
  }

  /**
   * Load create issue templates from configuration file
   * @param projectKey Optional project key to load templates for (defaults to first project)
   * @returns Array of create issue templates
   */
  async loadCreateIssueTemplates(projectKey?: string): Promise<JiraTemplate[]> {
    try {
      const configs = await this.loadProjectConfigs(this.configPath);

      // If a specific project key is provided, find that project
      let config: JiraProjectConfig | undefined;
      if (projectKey) {
        const foundConfig = configs.find((c) => c.projectKey === projectKey);
        if (!foundConfig) {
          // Instead of throwing an error, return a basic template for unconfigured projects
          logger.error(
            `Project key '${projectKey}' not found in .jira-config.json, using basic template`,
          );
          return this.getBasicTemplates();
        }
        config = foundConfig;
      } else {
        // Otherwise, use the first project as default
        if (configs.length === 0) {
          throw new Error("No projects found in .jira-config.json");
        }
        // Default to the first project in the array
        config = configs[0];
      }

      const templates = config.create_issue_template;

      // Validate that we have at least one template
      if (!templates || templates.length === 0) {
        throw new Error(
          `No templates found for project '${config.projectKey}' in .jira-config.json`,
        );
      }

      // Validate that each template has at least a type
      for (const template of templates) {
        if (!template.type) {
          throw new Error(
            `Missing required field 'type' in one of the templates for project '${config.projectKey}' in .jira-config.json`,
          );
        }
      }

      // Process templates to convert human-readable field names to Jira field IDs
      const processedTemplates = templates.map((template) => {
        const processedTemplate: JiraTemplate = {
          summary: template.summary,
          description: template.description,
          type: template.type,
          issuetype: template.issuetype,
          assignee: template.assignee,
        };

        // Process other fields
        for (const [key, value] of Object.entries(template)) {
          if (
            ![
              "summary",
              "description",
              "type",
              "issuetype",
              "assignee",
            ].includes(key)
          ) {
            // If the key is a human-readable name, map it to the Jira field ID
            const fieldId = this.mapFieldNameToId(key);
            processedTemplate[fieldId] = value;
          }
        }

        return processedTemplate;
      });

      return processedTemplates;
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        extractErrorMessage(error),
      );
    }
  }

  /**
   * Get template for a specific issue type
   * @param workingDir Optional working directory (uses configPath from constructor if not provided)
   * @param type Issue type
   * @param projectKey Optional project key to load template for (defaults to first project)
   * @returns Template for the specified issue type
   */
  async getTemplateForType(
    type: string,
    projectKey?: string,
  ): Promise<JiraTemplate> {
    try {
      const templates = await this.loadCreateIssueTemplates(projectKey);

      // Find the template for the specified type
      const template = templates.find(
        (t) => t.type.toLowerCase() === type.toLowerCase(),
      );

      if (!template) {
        // Create a minimal template if none exists
        logger.info(`No template found for issue type '${type}', creating minimal template`);
        return {
          type: type,
          summary: "",
          description: "",
        };
      }

      return template;
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        extractErrorMessage(error),
      );
    }
  }

  /**
   * Get default template (first template in the array)
   * @param workingDir Optional working directory (uses configPath from constructor if not provided)
   * @param projectKey Optional project key to load template for (defaults to first project)
   * @returns Default template
   */
  async getDefaultTemplate(projectKey?: string): Promise<JiraTemplate> {
    try {
      const templates = await this.loadCreateIssueTemplates(projectKey);
      // Default to the first template in the array
      return templates[0];
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        extractErrorMessage(error),
      );
    }
  }

  /**
   * Load project configurations from file
   * @param workingDir Working directory or path to config file
   * @returns Array of Jira project configurations
   */
  private async loadProjectConfigs(
    workingDir: string,
  ): Promise<JiraProjectConfig[]> {
    try {
      // Determine if workingDir is a directory or a file path
      let configPath = workingDir;

      try {
        // Check if workingDir is a directory
        const stats = await fs.promises.stat(workingDir);
        if (stats.isDirectory()) {
          // If it's a directory, append the config filename
          configPath = path.join(workingDir, ".jira-config.json");
          logger.info(`Loading config from directory: ${configPath}`);
        } else {
          // If it's a file, use it directly
          logger.info(`Loading config from file: ${configPath}`);
        }
      } catch (statError) {
        // If stat fails, assume workingDir is a directory and try to append the config filename
        configPath = path.join(workingDir, ".jira-config.json");
        logger.error(`Stat failed, trying: ${configPath}`);
      }

      // Try to read the config file
      let configContent;
      try {
        configContent = await fs.promises.readFile(configPath, "utf-8");
      } catch (readError) {
        // If reading fails, try to find the config file in the current directory
        const currentDirConfigPath = path.join(
          process.cwd(),
          ".jira-config.json",
        );
        logger.error(
          `Reading failed, trying current directory: ${currentDirConfigPath}`,
        );
        configContent = await fs.promises.readFile(
          currentDirConfigPath,
          "utf-8",
        );
      }

      const config = JSON.parse(configContent) as JiraConfig;

      // Convert to array if it's a single project config
      if (!Array.isArray(config)) {
        return [config];
      }

      return config;
    } catch (error) {
      logger.error(
        `Failed to load configuration: ${extractErrorMessage(error)}`,
      );
      throw new Error(
        `Failed to load configuration: ${extractErrorMessage(error)}`,
      );
    }
  }

  // Field mappings cache
  private fieldNameToIdCache: FieldMapping = {};
  private fieldIdToNameCache: Record<string, string> = {};

  /**
   * Map a field name to its Jira field ID
   * @param fieldName Field name (human-readable or Jira field ID)
   * @returns Jira field ID
   */
  public mapFieldNameToId(fieldName: string): string {
    // If the field name is already a Jira field ID, return it
    if (fieldName.startsWith("customfield_")) {
      return fieldName;
    }

    // Check cache first
    if (this.fieldNameToIdCache[fieldName]) {
      return this.fieldNameToIdCache[fieldName];
    }

    // If not in cache, return the original field name
    // The actual mapping will be handled by the JiraApiService using field metadata
    return fieldName;
  }

  /**
   * Map a field ID to its human-readable name
   * @param fieldId Jira field ID
   * @returns Human-readable field name
   */
  public mapFieldIdToName(fieldId: string): string {
    // Check cache first
    if (this.fieldIdToNameCache[fieldId]) {
      return this.fieldIdToNameCache[fieldId];
    }

    // If not in cache, return the original field ID
    // The actual mapping will be handled by the JiraApiService using field metadata
    return fieldId;
  }

  /**
   * Update field mapping caches with new mappings
   * @param nameToId Map of field names to IDs
   * @param idToName Map of field IDs to names
   */
  public updateFieldMappings(
    nameToId: FieldMapping,
    idToName: Record<string, string>,
  ): void {
    this.fieldNameToIdCache = { ...this.fieldNameToIdCache, ...nameToId };
    this.fieldIdToNameCache = { ...this.fieldIdToNameCache, ...idToName };
  }

  /**
   * Get basic templates for unconfigured projects
   * @returns Array of basic Jira templates
   */
  private getBasicTemplates(): JiraTemplate[] {
    return [
      {
        type: "Bug",
        summary: "",
        description: "",
      },
      {
        type: "Story",
        summary: "",
        description: "",
      },
      {
        type: "Task",
        summary: "",
        description: "",
      },
      {
        type: "Epic",
        summary: "",
        description: "",
      },
      {
        type: "Activity",
        summary: "",
        description: "",
      },
    ];
  }
}
