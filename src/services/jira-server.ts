/**
 * Jira MCP server
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JiraApiService } from "./jira-api.js";
import { FormatterService } from "./formatter-service.js";
import { ConfigService } from "./config-service.js";
import { AuthManager } from "./auth-manager.js";
import { isEqualIgnoreCase } from "../utils/formatters.js";
import { JiraTemplate } from "../models/types.js";

import { logger } from "../utils/logger.js";
/**
 * Jira server class
 */
export class JiraServer {
  private server: McpServer;
  private jiraApiService: JiraApiService | null = null;
  private formatterService: FormatterService | null = null;
  private configService: ConfigService;
  private currentProjectKey: string | null = null;
  private templates: JiraTemplate[] | null = null;
  private defaultTemplate: JiraTemplate | null = null;
  private authManager: AuthManager;
  private jiraDomain: string;

  /**
   * Constructor - accepts AuthManager for centralized authentication
   * @param authManager Authentication manager instance
   * @param jiraDomain jira system domain string
   * @param configPath Path to configuration file
   */
  constructor(
    authManager: AuthManager,
    jiraDomain: string,
    configPath: string,
  ) {
    this.authManager = authManager;
    this.jiraDomain = jiraDomain;
    this.configService = new ConfigService(configPath);

    this.server = new McpServer({
      name: "sap-jira-mcp",
      version: "2.0.0",
    });

    this.setupTools();

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Initialize services
   */
  private async initializeServices(): Promise<void> {
    if (!this.currentProjectKey || !this.templates || !this.defaultTemplate) {
      logger.info("[initializeServices] Starting service initialization");
      // Load the project key (defaults to the first project in the array if not specified)
      this.currentProjectKey = await this.configService.loadProjectKey();
      if (!this.currentProjectKey) {
        throw new Error("Failed to load project key from configuration");
      }

      // Load templates for the project (defaults to the first project in the array if not specified)
      this.templates = await this.configService.loadCreateIssueTemplates();
      if (!this.templates || this.templates.length === 0) {
        throw new Error("Failed to load templates from configuration");
      }

      // Get the default template (defaults to the first template in the array)
      this.defaultTemplate = await this.configService.getDefaultTemplate();
      if (!this.defaultTemplate) {
        throw new Error("Failed to load default template from configuration");
      }

      this.jiraApiService = new JiraApiService(
        this.jiraDomain,
        this.currentProjectKey,
        this.templates,
        this.configService,
        this.authManager,
      );

      await this.jiraApiService.initialize();

      this.formatterService = new FormatterService(
        this.jiraDomain,
        this.configService,
      );

      logger.info("[initializeServices] Service initialization completed");
    } else {
      logger.debug(
        "[initializeServices] Services already initialized, skipping",
      );
    }
  }

  /**
   * Get template for a specific issue type
   * @param type Issue type
   * @param projectKey Optional project key to search for template
   * @returns Template for the specified issue type, or a minimal template if not found
   */
  private async getTemplateForType(type: string, projectKey?: string): Promise<JiraTemplate> {
    if (!this.templates) {
      throw new Error("Templates not initialized");
    }

    // Find the template for the specified type
    const template = this.templates.find(
      (t) => t.type.toLowerCase() === type.toLowerCase(),
    );

    if (!template) {
      // If no template found, create a minimal default template
      logger.info(`No template found for issue type '${type}', creating minimal template`);
      return {
        type: type,
        summary: "",
        description: "",
      };
    }

    return template;
  }

  /**
   * Check if the template has required fields with missing values
   * @param template Template to check
   * @param args User-provided arguments
   * @param fieldMetadata Optional field metadata from API
   * @returns Array of missing field information objects
   */
  private checkRequiredFields(
    template: JiraTemplate,
    args: any,
    fieldMetadata?: Record<string, any>
  ): Array<{fieldId: string, fieldName: string, metadata: any}> {
    const missingFields: Array<{fieldId: string, fieldName: string, metadata: any}> = [];
    const processedFieldIds = new Set<string>();

    // Always check summary as it's required for all issue types
    if (!args.summary && !template.summary) {
      missingFields.push({
        fieldId: "summary",
        fieldName: "Summary",
        metadata: { required: true, schema: { type: "string" } }
      });
      processedFieldIds.add("summary");
    }

    // If we have field metadata from API, check all required fields
    if (fieldMetadata) {
      for (const [fieldId, metadata] of Object.entries(fieldMetadata)) {
        // Skip if not a proper metadata object
        if (typeof metadata !== "object" || metadata === null) {
          continue;
        }

        // Only process entries where the key is the actual fieldId to avoid duplicates
        // Skip entries that are stored by display name or lowercase name
        if (!metadata.fieldId || fieldId !== metadata.fieldId) {
          continue;
        }

        // Skip if we've already processed this field ID
        if (processedFieldIds.has(metadata.fieldId)) {
          continue;
        }

        // Skip common fields we already handle
        if (["project", "issuetype", "summary"].includes(metadata.fieldId)) {
          continue;
        }

        // Check if field is required
        if (metadata.required) {
          const fieldName = metadata.name || metadata.fieldId;
          
          // Check if user provided this field (check all possible variations)
          const userProvidedValue = 
            args[metadata.fieldId] || 
            args[fieldName] || 
            args[fieldName?.toLowerCase()];
          
          // Check if template provides this field (check all possible variations)
          const templateValue = 
            template[metadata.fieldId] || 
            template[fieldName] || 
            template[fieldName?.toLowerCase()];

          // Check if the value is effectively empty (empty string, empty object, etc.)
          const isUserValueEmpty = this.isEmptyValue(userProvidedValue);
          const isTemplateValueEmpty = this.isEmptyValue(templateValue);

          // If neither user nor template provides a non-empty value, it's missing
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
   * @param metadata Field metadata containing allowed values and schema information
   * @returns Formatted string with field options
   */
  private formatFieldOptions(metadata: any): string {
    let output = "";
    
    // Check if field has allowed values
    if (metadata.allowedValues && Array.isArray(metadata.allowedValues) && metadata.allowedValues.length > 0) {
      output += "**Available options:**\n";
      
      // Display all options without limiting
      metadata.allowedValues.forEach((option: any, index: number) => {
        let optionText = "";
        
        // Handle different option formats
        if (typeof option === "string") {
          optionText = option;
        } else if (typeof option === "object" && option !== null) {
          // Extract the most relevant display value
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
          
          // Handle nested child options (e.g., parent-child relationships)
          if (option.children && Array.isArray(option.children) && option.children.length > 0) {
            const childOptions = option.children.map((child: any) => {
              if (child.value) return child.value;
              if (child.name) return child.name;
              return JSON.stringify(child);
            }).join(", ");
            
            optionText += `\n  └─ Children: ${childOptions}`;
          }
        }
        
        output += `  ${index + 1}. ${optionText}\n`;
      });
    } else {
      // No allowed values, provide schema information
      output += "**Field type:** ";
      
      if (metadata.schema) {
        const schemaType = metadata.schema.type;
        const schemaItems = metadata.schema.items;
        
        if (schemaType === "array" && schemaItems) {
          output += `Array of ${schemaItems}`;
          
          // Provide format examples based on schema
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
   * @param args User-provided arguments
   * @param template Template to use for the issue
   * @returns Processed arguments
   */
  private processCustomFields(args: any, template: JiraTemplate): any {
    const processedArgs = { ...args };

    // Process all fields in the template first to extract any string values
    for (const [key, templateValue] of Object.entries(template)) {
      // Skip common fields that are handled separately
      if (
        [
          "summary",
          "description",
          "type",
          "issuetype",
          "assignee",
          "reporter",
        ].includes(key)
      ) {
        continue;
      }

      // Handle field mapping (e.g., 'Git Path' to 'customfield_44241')
      // This is a more generic approach than hardcoding specific field IDs
      if (key.startsWith("customfield_") || !key.includes(" ")) {
        continue; // Skip customfields and simple keys, they'll be handled in the main loop
      }

      // For fields with spaces (like 'Git Path'), try to find a matching customfield
      // This allows for human-readable field names to map to Jira field IDs
      for (const [possibleKey, possibleValue] of Object.entries(template)) {
        if (possibleKey.startsWith("customfield_")) {
          // Extract values from both fields to compare
          const readableValue = this.extractStringValue(templateValue);
          const customValue = this.extractStringValue(possibleValue);

          // If values match, they might be the same field with different names
          if (readableValue && customValue && readableValue === customValue) {
            logger.error(
              `Found potential field mapping: '${key}' → '${possibleKey}'`,
            );
            // Don't set anything here, just log the potential mapping
          }
        }
      }

      // Extract the string value from the template field
      const extractedValue = this.extractStringValue(templateValue);
      if (extractedValue) {
        // Only set if user hasn't provided a value
        if (!(key in processedArgs)) {
          processedArgs[key] = extractedValue;
        }
      }
    }

    // Process all fields in the template
    for (const [key, value] of Object.entries(template)) {
      // Skip common fields
      if (
        ["summary", "description", "type", "issuetype", "assignee"].includes(
          key,
        )
      ) {
        continue;
      }

      // If the user provided a value for this field
      if (key in processedArgs) {
        const userValue = processedArgs[key];

        // Skip empty string values
        if (userValue === "") {
          delete processedArgs[key];
          continue;
        }

        // If the user value is already an object or array, use it directly
        if (typeof userValue === "object" && userValue !== null) {
          // Keep as is - no conversion needed
        }
        // If the template value is an array
        else if (Array.isArray(value)) {
          // Try to parse the string as JSON first
          try {
            const parsedValue = JSON.parse(userValue);
            if (Array.isArray(parsedValue)) {
              processedArgs[key] = parsedValue;
            } else {
              // If it's not an array, convert to array with the same structure as template
              if (value.length > 0) {
                if (typeof value[0] === "object" && value[0] !== null) {
                  if ("name" in value[0]) {
                    // For arrays of objects with name property (like components)
                    // Check if the value is a comma-separated list
                    if (
                      typeof userValue === "string" &&
                      userValue.includes(",")
                    ) {
                      processedArgs[key] = userValue
                        .split(",")
                        .map((item) => item.trim())
                        .filter((item) => item !== "")
                        .map((item) => ({ name: item }));
                    } else {
                      processedArgs[key] = [{ name: userValue }];
                    }
                  } else if ("value" in value[0]) {
                    // For arrays of objects with value property
                    // Check if the value is a comma-separated list
                    if (
                      typeof userValue === "string" &&
                      userValue.includes(",")
                    ) {
                      processedArgs[key] = userValue
                        .split(",")
                        .map((item) => item.trim())
                        .filter((item) => item !== "")
                        .map((item) => ({ value: item }));
                    } else {
                      processedArgs[key] = [{ value: userValue }];
                    }
                  } else {
                    // For other object structures, use the same structure
                    if (
                      typeof userValue === "string" &&
                      userValue.includes(",")
                    ) {
                      processedArgs[key] = userValue
                        .split(",")
                        .map((item) => item.trim())
                        .filter((item) => item !== "");
                    } else {
                      processedArgs[key] = [userValue];
                    }
                  }
                } else {
                  // For simple arrays
                  if (
                    typeof userValue === "string" &&
                    userValue.includes(",")
                  ) {
                    processedArgs[key] = userValue
                      .split(",")
                      .map((item) => item.trim())
                      .filter((item) => item !== "");
                  } else {
                    processedArgs[key] = [userValue];
                  }
                }
              } else {
                // Empty array in template, just use a simple array
                if (typeof userValue === "string" && userValue.includes(",")) {
                  processedArgs[key] = userValue
                    .split(",")
                    .map((item) => item.trim())
                    .filter((item) => item !== "");
                } else {
                  processedArgs[key] = [userValue];
                }
              }
            }
          } catch (e) {
            // Not valid JSON, handle as string
            // Check if the value is a comma-separated list
            if (typeof userValue === "string" && userValue.includes(",")) {
              if (
                value.length > 0 &&
                typeof value[0] === "object" &&
                value[0] !== null
              ) {
                if ("name" in value[0]) {
                  processedArgs[key] = userValue
                    .split(",")
                    .map((item) => item.trim())
                    .filter((item) => item !== "")
                    .map((item) => ({ name: item }));
                } else if ("value" in value[0]) {
                  processedArgs[key] = userValue
                    .split(",")
                    .map((item) => item.trim())
                    .filter((item) => item !== "")
                    .map((item) => ({ value: item }));
                } else {
                  processedArgs[key] = userValue
                    .split(",")
                    .map((item) => item.trim())
                    .filter((item) => item !== "");
                }
              } else {
                processedArgs[key] = userValue
                  .split(",")
                  .map((item) => item.trim())
                  .filter((item) => item !== "");
              }
            } else {
              // Single value
              if (
                value.length > 0 &&
                typeof value[0] === "object" &&
                value[0] !== null
              ) {
                if ("name" in value[0]) {
                  processedArgs[key] = [{ name: userValue }];
                } else if ("value" in value[0]) {
                  processedArgs[key] = [{ value: userValue }];
                } else {
                  processedArgs[key] = [userValue];
                }
              } else {
                processedArgs[key] = [userValue];
              }
            }
          }
        }
        // If the template value is an object with nested structure (like customfield_44240 with child)
        else if (
          typeof value === "object" &&
          value !== null &&
          "child" in value
        ) {
          // Try to parse the string as JSON first
          try {
            const parsedValue = JSON.parse(userValue);
            if (typeof parsedValue === "object" && parsedValue !== null) {
              processedArgs[key] = parsedValue;
            } else {
              // If it's not an object, use default structure
              if ("value" in value) {
                // Check if the value has a parent-child format (e.g., "Mobile - CT-Component")
                if (
                  typeof userValue === "string" &&
                  userValue.includes(" - ")
                ) {
                  const [parentValue, childValue] = userValue
                    .split(" - ")
                    .map((part) => part.trim());
                  processedArgs[key] = {
                    value: parentValue,
                    child: { value: childValue },
                  };
                } else {
                  processedArgs[key] = {
                    value: userValue,
                    child: { value: "" },
                  };
                }
              } else {
                processedArgs[key] = value; // Use template structure
              }
            }
          } catch (e) {
            // Not valid JSON, handle as string
            // Check if the value has a parent-child format (e.g., "Mobile - CT-Component")
            if (typeof userValue === "string" && userValue.includes(" - ")) {
              const [parentValue, childValue] = userValue
                .split(" - ")
                .map((part) => part.trim());
              processedArgs[key] = {
                value: parentValue,
                child: { value: childValue },
              };
            } else {
              if ("value" in value) {
                processedArgs[key] = {
                  value: userValue,
                  child: { value: "" },
                };
              } else {
                processedArgs[key] = value; // Use template structure
              }
            }
          }
        }
        // If the template value is an object with a value property
        else if (
          typeof value === "object" &&
          value !== null &&
          "value" in value
        ) {
          // Try to parse the string as JSON first
          try {
            const parsedValue = JSON.parse(userValue);
            if (typeof parsedValue === "object" && parsedValue !== null) {
              processedArgs[key] = parsedValue;
            } else {
              // Format the user value to match the template structure
              processedArgs[key] = { value: userValue };
            }
          } catch (e) {
            // Not valid JSON, use as string
            processedArgs[key] = { value: userValue };
          }
        }
        // If the template value is an object with a name property
        else if (
          typeof value === "object" &&
          value !== null &&
          "name" in value
        ) {
          // Try to parse the string as JSON first
          try {
            const parsedValue = JSON.parse(userValue);
            if (typeof parsedValue === "object" && parsedValue !== null) {
              processedArgs[key] = parsedValue;
            } else {
              // Format the user value to match the template structure
              processedArgs[key] = { name: userValue };
            }
          } catch (e) {
            // Not valid JSON, use as string
            processedArgs[key] = { name: userValue };
          }
        }
        // For other cases, try to parse as JSON first, then keep as is if not valid JSON
        else {
          try {
            const parsedValue = JSON.parse(userValue);
            processedArgs[key] = parsedValue;
          } catch (e) {
            // Not valid JSON, keep the user value as is
          }
        }
      }
      // If the user didn't provide a value, check if the template value is empty and skip it
      else {
        // Skip fields with empty values in the template
        if (this.isEmptyValue(value)) {
          delete template[key]; // Remove from template to avoid using it as default
        }
      }
    }

    // Process all user-provided fields that are not in the template
    for (const [key, value] of Object.entries(processedArgs)) {
      // Skip common fields and fields already processed above
      if (
        ["summary", "description", "type", "issuetype", "assignee"].includes(
          key,
        ) ||
        key in template
      ) {
        continue;
      }

      // Skip empty string values
      if (value === "") {
        delete processedArgs[key];
        continue;
      }

      // If the value is a string, try to parse it as JSON
      if (typeof value === "string") {
        try {
          const parsedValue = JSON.parse(value);
          processedArgs[key] = parsedValue;
        } catch (e) {
          // Not valid JSON, check if it might be an array or object based on common patterns

          // Check if it looks like an array (comma-separated values)
          if (value.includes(",")) {
            // For fields that typically contain arrays
            if (
              key.toLowerCase().includes("label") ||
              key.toLowerCase().includes("tag") ||
              key.toLowerCase().includes("component")
            ) {
              processedArgs[key] = value
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item !== "");

              // For components, use name property
              if (key.toLowerCase().includes("component")) {
                processedArgs[key] = processedArgs[key].map((item: string) => ({
                  name: item,
                }));
              }
            }
          }
          // Check if it looks like a parent-child relationship
          else if (value.includes(" - ")) {
            // For fields that might have parent-child relationships
            if (
              key.toLowerCase().includes("type") ||
              key.toLowerCase().includes("automation")
            ) {
              const [parentValue, childValue] = value
                .split(" - ")
                .map((part) => part.trim());
              processedArgs[key] = {
                value: parentValue,
                child: { value: childValue },
              };
            }
          }
          // For custom fields, default to value property
          else if (key.startsWith("customfield_")) {
            processedArgs[key] = { value };
          }
          // Keep as is for other fields
        }
      }
    }

    // Create a clean copy of the template without empty values
    const cleanTemplate = { ...template };
    for (const [key, value] of Object.entries(cleanTemplate)) {
      if (this.isEmptyValue(value) && !(key in processedArgs)) {
        delete cleanTemplate[key];
      }
    }

    return processedArgs;
  }

  /**
   * Check if a value is empty
   * @param value Value to check
   * @returns True if the value is empty, false otherwise
   */
  private isEmptyValue(value: any): boolean {
    // If it's a string, check if it's empty
    if (typeof value === "string") {
      return value === "";
    }

    // If it's an object with a value property, check if the value is empty
    if (typeof value === "object" && value !== null && "value" in value) {
      return value.value === "";
    }

    // If it's an object with a name property, check if the name is empty
    if (typeof value === "object" && value !== null && "name" in value) {
      return value.name === "";
    }

    // If it's an array, check if it's empty or if all items are empty
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return true;
      }

      // Check if all items in the array are empty
      return value.every((item) => this.isEmptyValue(item));
    }

    // For other cases, consider it not empty
    return false;
  }

  /**
   * Extract a string value from various data types
   * @param value Value to extract string from
   * @returns Extracted string value or empty string if not extractable
   */
  private extractStringValue(value: any): string {
    // If it's already a string, return it
    if (typeof value === "string") {
      return value;
    }

    // If it's an object with a value property, extract the value
    if (typeof value === "object" && value !== null && "value" in value) {
      return String(value.value || "");
    }

    // If it's an object with a name property, extract the name
    if (typeof value === "object" && value !== null && "name" in value) {
      return String(value.name || "");
    }

    // If it's an array with objects that have value or name properties
    if (Array.isArray(value) && value.length > 0) {
      if (typeof value[0] === "object" && value[0] !== null) {
        if ("value" in value[0]) {
          return String(value[0].value || "");
        }
        if ("name" in value[0]) {
          return String(value[0].name || "");
        }
      }
      // If it's a simple array, return the first element
      return String(value[0] || "");
    }

    // For other cases, try to convert to string
    try {
      return String(value || "");
    } catch (e) {
      return "";
    }
  }

  /**
   * Get the required fields structure for creating a ticket of a specific type in a project
   */
  private async getRequiredFieldsStructure(
    projectKey: string,
    type: string,
    args?: any,
  ): Promise<any> {
    try {
      await this.initializeServices();

      if (!this.jiraApiService) {
        throw new Error("Jira API service not initialized");
      }

      const jiraApiService = new JiraApiService(
        this.jiraDomain,
        projectKey,
        this.templates || [],
        this.configService,
        this.authManager,
      );

      let issueTypeId: string;
      try {
        issueTypeId = await jiraApiService.getIssueTypeId(type);
      } catch (error) {
        throw new Error(
          `Issue type '${type}' not found in project '${projectKey}'`,
        );
      }

      const fieldMetadata = await jiraApiService.getFieldMetadata(issueTypeId);

      const fieldsStructure: any = {
        type: type,
        issuetype: { id: issueTypeId },
        project: { key: projectKey },
        _meta: {
          api_endpoint: `https://${this.jiraDomain}/rest/api/2/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`,
        },
      };

      for (const [fieldId, metadata] of Object.entries(fieldMetadata)) {
        if (
          typeof metadata === "object" &&
          metadata !== null &&
          metadata.required
        ) {
          if (["project", "issuetype"].includes(fieldId)) {
            continue;
          }

          const fieldName = metadata.name;
          fieldsStructure[fieldId] = {
            name: fieldName,
            required: true,
          };

          if (fieldName && typeof fieldName === "string") {
            fieldsStructure[fieldName] = {
              name: fieldName,
              required: true,
            };
            fieldsStructure[fieldName.toLowerCase()] = {
              name: fieldName,
              required: true,
            };
          }
        }
      }

      if (args) {
        for (const [key, value] of Object.entries(args)) {
          if (
            key in fieldsStructure ||
            key === "projectKey" ||
            key === "type"
          ) {
            continue;
          }

          for (const [fieldId, metadata] of Object.entries(fieldMetadata)) {
            if (typeof metadata === "object" && metadata !== null) {
              const fieldName = metadata.name;

              if (
                fieldId === key ||
                (fieldName &&
                  typeof fieldName === "string" &&
                  fieldName.toLowerCase() === key.toLowerCase())
              ) {
                fieldsStructure[fieldId] = {
                  name: fieldName,
                  required: false,
                };

                if (fieldName && typeof fieldName === "string") {
                  fieldsStructure[fieldName] = {
                    name: fieldName,
                    required: false,
                  };
                  fieldsStructure[fieldName.toLowerCase()] = {
                    name: fieldName,
                    required: false,
                  };
                }

                break;
              }
            }
          }
        }
      }

      return fieldsStructure;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Get issue types for a project
   */
  private async getProjectIssueTypes(projectKey: string): Promise<any> {
    try {
      await this.initializeServices();

      if (!this.jiraApiService) {
        throw new Error("Jira API service not initialized");
      }

      const jiraApiService = new JiraApiService(
        this.jiraDomain,
        projectKey,
        this.templates || [],
        this.configService,
        this.authManager,
      );

      const apiUrl = `https://${this.jiraDomain}/rest/api/2/issue/createmeta/${projectKey}/issuetypes`;
      logger.error(`Fetching issue types from: ${apiUrl}`);

      try {
        await jiraApiService.getIssueTypeId("dummy_type_to_get_all_types");
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Available types:")
        ) {
          const typesString = error.message.split("Available types:")[1].trim();
          const types = typesString.split(", ").map((type) => type.trim());

          return {
            values: types.map((type) => ({ name: type })),
            _meta: {
              api_endpoint: apiUrl,
            },
          };
        }
      }

      return {
        values: [],
        _meta: {
          api_endpoint: apiUrl,
        },
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Set up all tools using the new registerTool method
   */
  private setupTools(): void {
    // Create Issue Tool
    const createIssueTool = this.server.registerTool(
      "create_issue",
      {
        title: "Create Issue",
        description: "Create a new Jira issue",
        inputSchema: {
          summary: z.string().describe("Issue summary/title"),
          description: z.string().optional().describe("Issue description"),
          type: z
            .string()
            .optional()
            .describe("Issue type (Test, Epic, Story, Activity, Sub-Task)"),
          assignee: z.string().optional().describe("Issue assignee(inumber)"),
          reporter: z.string().optional().describe("Issue reporter(inumber)"),
          projectKey: z
            .string()
            .optional()
            .describe(
              "Project key (e.g., MOB, WRK) to specify which project's template to use",
            ),
          issuetype: z
            .object({ id: z.string() })
            .optional()
            .describe("Issue type object with ID"),
          labels: z
            .string()
            .optional()
            .describe("Field for labels (used in Test template)"),
          components: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe(
              "Field for components - accepts string, string array, or object array with id/name",
            ),
          priority: z
            .string()
            .optional()
            .describe("Field for priority (used in Activity template)"),
          customfield_10240: z
            .string()
            .optional()
            .describe(
              "Test Type - Field for Test Type (e.g., Functional Integration, End to End Tests)",
            ),
          customfield_43740: z
            .string()
            .optional()
            .describe("Agile Team - Field for Agile Team (option ID)"),
          customfield_44240: z
            .string()
            .optional()
            .describe(
              "Automation Type - Field for Automation Type (e.g., Mobile, ADFv2)",
            ),
          customfield_43758: z
            .string()
            .optional()
            .describe("Stack - Field for Stack (e.g., Mobile Client(Android))"),
          customfield_22442: z
            .string()
            .optional()
            .describe(
              "Test Execution Type - Field for Test Execution Type (e.g., Manual, Cucumber)",
            ),
          customfield_22453: z
            .string()
            .optional()
            .describe(
              "Test Path - Field for Test Path (e.g., /SHG - Blue/Android/CT/Org Chart, /au-worktech)",
            ),
          customfield_44241: z
            .string()
            .optional()
            .describe("Git Path - Field for Git Path"),
          customfield_15141: z
            .string()
            .optional()
            .describe("Epic Name - Field for Epic Name"),
          customfield_44041: z
            .string()
            .optional()
            .describe(
              "Mobile Required - Field for Mobile Required (e.g., Yes, No)",
            ),
          customfield_43773: z
            .string()
            .optional()
            .describe("UI Required - Field for UI Required (e.g., Yes, No)"),
          customfield_15140: z
            .string()
            .optional()
            .describe("Epic Link - Field for Epic Link"),
          fixVersions: z
            .string()
            .optional()
            .describe("Field for fixVersions (used in Activity template)"),
          versions: z
            .string()
            .optional()
            .describe("Field for versions (used in Activity template)"),
          parent: z
            .string()
            .optional()
            .describe("Field for parent (used in Sub-Task template)"),
          sprint: z
            .string()
            .optional()
            .describe(
              "Sprint - Field for Sprint (e.g., sprint name or sprint ID)",
            ),
          customfield_12740: z
            .string()
            .optional()
            .describe(
              "Sprint - Field for Sprint using field ID (e.g., sprint name or sprint ID)",
            ),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (
          !this.jiraApiService ||
          !this.formatterService ||
          !this.currentProjectKey ||
          !this.templates ||
          !this.defaultTemplate
        ) {
          throw new Error("Services not initialized");
        }

        // Handle project-specific template logic
        let projectKey = this.currentProjectKey;
        let templates = this.templates;
        let defaultTemplate = this.defaultTemplate;

        // Check if projectKey is specified in the arguments
        if (args.projectKey) {
          projectKey = await this.configService.loadProjectKey(args.projectKey);
          templates =
            await this.configService.loadCreateIssueTemplates(projectKey);
          defaultTemplate =
            await this.configService.getDefaultTemplate(projectKey);

          const jiraApiService = new JiraApiService(
            this.jiraDomain,
            projectKey,
            templates,
            this.configService,
            this.authManager,
          );

          const type = args.type || defaultTemplate.type;
          let template = templates.find(
            (t) => t.type.toLowerCase() === type.toLowerCase(),
          );

          if (!template) {
            // Create a minimal template if none exists
            logger.info(`No template found for issue type '${type}' in project '${projectKey}', creating minimal template`);
            template = {
              type: type,
              summary: "",
              description: "",
            };
          }

          // Check for missing required fields with metadata
          const issueTypeId = await jiraApiService.getIssueTypeId(type);
          const fieldMetadata = await jiraApiService.getFieldMetadata(issueTypeId);
          const missingFields = this.checkRequiredFields(template, args, fieldMetadata);
          
          if (missingFields.length > 0) {
            // Generate detailed error message with available options
            const fieldDetails = await Promise.all(
              missingFields.map(async (field) => {
                const options = this.formatFieldOptions(field.metadata);
                return `\n\n**${field.fieldName}** (${field.fieldId}):\n${options}`;
              })
            );
            
            throw new Error(
              `Missing required fields for issue type '${type}' in project '${projectKey}':${fieldDetails.join("")}\n\nPlease provide values for these fields and try again.`,
            );
          }

          const processedArgs = this.processCustomFields(args, template);
          delete processedArgs.projectKey;

          const createdIssue = await jiraApiService.createIssue(
            processedArgs,
            template,
          );

          return {
            content: [
              {
                type: "text",
                text: this.formatterService.formatCreatedIssue(createdIssue),
              },
            ],
          };
        } else {
          // Handle default project logic
          const allProjectKeys = await this.configService.getAllProjectKeys();
          let foundTemplate = null;
          let foundProjectKey = null;

          if (args.type) {
            for (const projKey of allProjectKeys) {
              const projTemplates =
                await this.configService.loadCreateIssueTemplates(projKey);
              const matchingTemplate = projTemplates.find(
                (t) =>
                  args.type && t.type.toLowerCase() === args.type.toLowerCase(),
              );

              if (matchingTemplate) {
                foundTemplate = matchingTemplate;
                foundProjectKey = projKey;
                const typeForLogging = args.type ?? "undefined";
                logger.error(
                  `Found template for type ${typeForLogging} in project ${projKey}`,
                );
                break;
              }
            }

            if (
              foundTemplate &&
              foundProjectKey &&
              foundProjectKey !== this.currentProjectKey
            ) {
              const typeForLogging = args.type ?? "unknown";
              logger.error(
                `Using template from project ${foundProjectKey} for type ${typeForLogging}`,
              );

              const jiraApiService = new JiraApiService(
                this.jiraDomain,
                foundProjectKey,
                await this.configService.loadCreateIssueTemplates(
                  foundProjectKey,
                ),
                this.configService,
                this.authManager,
              );

              // Check for missing required fields with metadata
              const issueTypeId = await jiraApiService.getIssueTypeId(foundTemplate.type);
              const fieldMetadata = await jiraApiService.getFieldMetadata(issueTypeId);
              const missingFields = this.checkRequiredFields(foundTemplate, args, fieldMetadata);
              
              if (missingFields.length > 0) {
                // Generate detailed error message with available options
                const fieldDetails = await Promise.all(
                  missingFields.map(async (field) => {
                    const options = this.formatFieldOptions(field.metadata);
                    return `\n\n**${field.fieldName}** (${field.fieldId}):\n${options}`;
                  })
                );
                
                throw new Error(
                  `Missing required fields for issue type '${typeForLogging}' in project '${foundProjectKey}':${fieldDetails.join("")}\n\nPlease provide values for these fields and try again.`,
                );
              }

              const processedArgs = this.processCustomFields(
                args,
                foundTemplate,
              );
              const createdIssue = await jiraApiService.createIssue(
                processedArgs,
                foundTemplate,
              );

              return {
                content: [
                  {
                    type: "text",
                    text: this.formatterService.formatCreatedIssue(
                      createdIssue,
                    ),
                  },
                ],
              };
            }
          }

          let type = args.type;
          let template;

          if (args.issuetype && args.issuetype.id) {
            const issueTypeId = args.issuetype.id;
            template = this.templates.find(
              (t) =>
                t.issuetype &&
                typeof t.issuetype === "object" &&
                "id" in t.issuetype &&
                t.issuetype.id === issueTypeId,
            );

            if (template) {
              type = template.type;
              logger.error(
                `Found template for issuetype.id ${issueTypeId}: ${type}`,
              );
            } else {
              template = this.defaultTemplate;
              type = template.type;
              logger.error(
                `No template found for issuetype.id ${issueTypeId}, using default: ${type}`,
              );
            }
          } else {
            type = type || this.defaultTemplate.type;
            template = await this.getTemplateForType(type);
          }

          // Check for missing required fields with metadata
          let issueTypeId: string;
          if (template.issuetype && typeof template.issuetype === "object" && "id" in template.issuetype) {
            issueTypeId = String(template.issuetype.id);
          } else {
            issueTypeId = await this.jiraApiService.getIssueTypeId(type);
          }
          
          const fieldMetadata = await this.jiraApiService.getFieldMetadata(issueTypeId);
          const missingFields = this.checkRequiredFields(template, args, fieldMetadata);
          
          if (missingFields.length > 0) {
            // Generate detailed error message with available options
            const fieldDetails = await Promise.all(
              missingFields.map(async (field) => {
                const options = this.formatFieldOptions(field.metadata);
                return `\n\n**${field.fieldName}** (${field.fieldId}):\n${options}`;
              })
            );
            
            throw new Error(
              `Missing required fields for issue type '${type}':${fieldDetails.join("")}\n\nPlease provide values for these fields and try again.`,
            );
          }

          const processedArgs = this.processCustomFields(args, template);

          const createdIssue = await this.jiraApiService.createIssue(
            processedArgs,
            template,
          );

          return {
            content: [
              {
                type: "text",
                text: this.formatterService.formatCreatedIssue(createdIssue),
              },
            ],
          };
        }
      },
    );

    // Override the inputSchema to accept any additional fields (passthrough for customfields)
    if (createIssueTool.inputSchema) {
      // @ts-ignore - We need to override the SDK's strict schema
      createIssueTool.inputSchema = z
        .object(createIssueTool.inputSchema.shape)
        .passthrough();
    }

    // Search Issues Tool
    this.server.registerTool(
      "search_issues",
      {
        title: "Search Issues",
        description:
          "Search issues in the project with advanced filters including sprint support and flexible JQL extensions, before you build JQL, please learn examples from tool:jql_examples",
        inputSchema: {
          status: z
            .string()
            .optional()
            .describe(
              'Filter by status (e.g., "Open", "To Do", "In Progress", "Done")',
            ),
          assignee: z
            .string()
            .optional()
            .describe("Issue assignee(inumber),my"),
          sprint: z
            .string()
            .optional()
            .describe(
              'Filter by sprint name or sprint ID (e.g., "Mobile 2508" or "297108")',
            ),
          additionalJql: z
            .string()
            .optional()
            .describe(
              'Additional JQL conditions to extend the search query (e.g., "(labels IS NOT EMPTY) OR (fixVersion IS NOT EMPTY)", "priority = High", "created >= -7d"), DON\'t put ORDER BY here',
            ),
          projectKey: z
            .string()
            .optional()
            .describe(
              'Project key to search in (e.g., "MOB", "WRK"). If not provided, searches across all projects.',
            ),
        },
      },
      async (args) => {
        logger.info(
          `[search_issues] Tool called with args: ${JSON.stringify(args)}`,
        );
        await this.initializeServices();

        if (
          !this.jiraApiService ||
          !this.formatterService ||
          !this.currentProjectKey ||
          !this.defaultTemplate
        ) {
          throw new Error("Services not initialized");
        }

        const { status, assignee, sprint, additionalJql, projectKey } = args;

        // Handle assignee resolution
        let resolvedAssignee = assignee;

        if (assignee) {
          // Check if user input represents "me/myself"
          if (
            isEqualIgnoreCase(assignee, "me") ||
            isEqualIgnoreCase(assignee, "my") ||
            isEqualIgnoreCase(assignee, "myself")
          ) {
            resolvedAssignee = this.defaultTemplate.assignee;
          }
          // Check if assignee is not an inumber (doesn't start with 'I' followed by digits)
          else if (!/^I\d+$/.test(assignee)) {
            try {
              // Try to get user info to find the inumber
              const users = await this.jiraApiService.getUserInfo({
                username: assignee,
              });
              if (users && users.length > 0) {
                // Use the first matching user's name (which should be their inumber)
                resolvedAssignee = users[0].name;
                logger.error(
                  `Resolved username "${assignee}" to inumber "${resolvedAssignee}"`,
                );
              } else {
                logger.error(
                  `No user found for username "${assignee}", using as-is`,
                );
                resolvedAssignee = assignee;
              }
            } catch (error) {
              logger.error(`Failed to resolve username "${assignee}":`, error);
              resolvedAssignee = assignee; // Fall back to original input
            }
          }
        }
        // Note: If assignee is not provided, resolvedAssignee will be undefined
        // This allows searching without assignee filter

        const issues = await this.jiraApiService.searchIssues({
          status,
          assignee: resolvedAssignee,
          sprint,
          additionalJql,
          projectKey,
        });

        // Use the specified projectKey for formatting, or fall back to current project key
        const displayProjectKey = projectKey || this.currentProjectKey;

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatIssueList(
                issues,
                displayProjectKey,
              ),
            },
          ],
        };
      },
    );

    // Update Issue Tool
    const updateIssueTool = this.server.registerTool(
      "update_issue",
      {
        title: "Update Issue",
        description: "Update an existing issue",
        inputSchema: {
          issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
          summary: z.string().optional().describe("New summary/title"),
          description: z.string().optional().describe("New description"),
          status: z.string().optional().describe("New status"),
          assignee: z.string().optional().describe("Issue assignee(inumber)"),
          reporter: z.string().optional().describe("Issue reporter(inumber)"),
          labels: z
            .string()
            .optional()
            .describe("Field for labels (used in Test template)"),
          components: z
            .union([z.string(), z.array(z.string())])
            .optional()
            .describe(
              "Field for components - accepts string, string array, or object array with id/name",
            ),
          priority: z
            .string()
            .optional()
            .describe("Field for priority (used in Activity template)"),
          customfield_10240: z
            .string()
            .optional()
            .describe(
              "Test Type - Field for Test Type (e.g., Functional Integration, End to End Tests)",
            ),
          customfield_43740: z
            .string()
            .optional()
            .describe("Agile Team - Field for Agile Team (option ID)"),
          customfield_44240: z
            .string()
            .optional()
            .describe(
              "Automation Type - Field for Automation Type (e.g., Mobile, ADFv2)",
            ),
          customfield_43758: z
            .string()
            .optional()
            .describe("Stack - Field for Stack (e.g., Mobile Client(Android))"),
          customfield_22442: z
            .string()
            .optional()
            .describe(
              "Test Execution Type - Field for Test Execution Type (e.g., Manual, Cucumber)",
            ),
          customfield_22453: z
            .string()
            .optional()
            .describe(
              "Test Path - Field for Test Path (e.g., /SHG - Blue/Android/CT/Org Chart, /au-worktech)",
            ),
          customfield_44241: z
            .string()
            .optional()
            .describe("Git Path - Field for Git Path"),
          customfield_15141: z
            .string()
            .optional()
            .describe("Epic Name - Field for Epic Name"),
          customfield_44041: z
            .string()
            .optional()
            .describe(
              "Mobile Required - Field for Mobile Required (e.g., Yes, No)",
            ),
          customfield_43773: z
            .string()
            .optional()
            .describe("UI Required - Field for UI Required (e.g., Yes, No)"),
          customfield_15140: z
            .string()
            .optional()
            .describe("Epic Link - Field for Epic Link"),
          fixVersions: z
            .string()
            .optional()
            .describe("Field for fixVersions (used in Activity template)"),
          versions: z
            .string()
            .optional()
            .describe("Field for versions (used in Activity template)"),
          parent: z
            .string()
            .optional()
            .describe("Field for parent (used in Sub-Task template)"),
          sprint: z
            .string()
            .optional()
            .describe(
              "Sprint - Field for Sprint (e.g., sprint name or sprint ID)",
            ),
          customfield_12740: z
            .string()
            .optional()
            .describe(
              "Sprint - Field for Sprint using field ID (e.g., sprint name or sprint ID)",
            ),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const updatedIssue = await this.jiraApiService.updateIssue(args);
        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatIssue(updatedIssue),
            },
          ],
        };
      },
    );

    // Override the inputSchema to accept any additional fields (passthrough for customfields)
    if (updateIssueTool.inputSchema) {
      // @ts-ignore - We need to override the SDK's strict schema
      updateIssueTool.inputSchema = z
        .object(updateIssueTool.inputSchema.shape)
        .passthrough();
    }

    // Get Issue Tool
    this.server.registerTool(
      "get_issue",
      {
        title: "Get Issue",
        description: "Get details of a specific issue",
        inputSchema: {
          issue_key: z.string().describe("Issue key (e.g., MOB-123)"),
          fields: z
            .string()
            .optional()
            .describe(
              "Comma-separated list of specific fields to display. If not provided, only template fields will be shown.",
            ),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService || !this.formatterService || !this.templates) {
          throw new Error("Services not initialized");
        }

        const issue = await this.jiraApiService.getIssue(args);

        // Check if specific fields were requested
        if (args.fields) {
          (issue as any)._requestedFields = Array.isArray(args.fields)
            ? args.fields
            : typeof args.fields === "string"
              ? args.fields.split(",").map((f: string) => f.trim())
              : [];
        }

        // Find and attach the template for this issue type
        const issueType = issue.fields?.issuetype?.name;
        if (issueType && this.templates) {
          const template = this.templates.find(
            (t) => t.type.toLowerCase() === issueType.toLowerCase(),
          );
          if (template) {
            (issue as any)._template = template;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatIssue(issue),
            },
          ],
        };
      },
    );

    // Delete Issue Tool
    this.server.registerTool(
      "delete_issue",
      {
        title: "Delete Issue",
        description: "Delete a Jira issue",
        inputSchema: {
          issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        await this.jiraApiService.deleteIssue(args);
        return {
          content: [
            {
              type: "text",
              text: `Issue ${args.issue_key} has been deleted.`,
            },
          ],
        };
      },
    );

    // Get Transitions Tool
    this.server.registerTool(
      "get_transitions",
      {
        title: "Get Transitions",
        description:
          "Get available transitions (status changes) for a Jira issue",
        inputSchema: {
          issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        const transitions = await this.jiraApiService.getTransitions(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(transitions, null, 2),
            },
          ],
        };
      },
    );

    // Update Transition Tool
    this.server.registerTool(
      "update_transition",
      {
        title: "Update Transition",
        description:
          "Update the transition (change status) of a Jira issue. Use get_transitions first to get available transition IDs.",
        inputSchema: {
          issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
          transition_id: z
            .string()
            .describe("Transition ID obtained from get_transitions tool"),
          comment: z
            .string()
            .optional()
            .describe("Optional comment to add when transitioning"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        const result = await this.jiraApiService.updateTransition(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    // Add Comment Tool
    this.server.registerTool(
      "add_comment",
      {
        title: "Add Comment",
        description: "Add a comment to an existing issue",
        inputSchema: {
          issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
          comment: z.string().describe("Comment text to add to the issue"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        await this.jiraApiService.addComment(args);
        return {
          content: [
            {
              type: "text",
              text: `Comment added to issue ${args.issue_key}`,
            },
          ],
        };
      },
    );

    // Delete Comment Tool
    this.server.registerTool(
      "delete_comment",
      {
        title: "Delete Comment",
        description: "Delete a comment from an existing issue",
        inputSchema: {
          issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
          comment_id: z.string().describe("Comment ID to delete"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        await this.jiraApiService.deleteComment(
          args.issue_key,
          args.comment_id,
        );
        return {
          content: [
            {
              type: "text",
              text: `Comment ${args.comment_id} deleted from issue ${args.issue_key}`,
            },
          ],
        };
      },
    );

    // Get User Info Tool
    this.server.registerTool(
      "get_user_info",
      {
        title: "Get User Info",
        description: "Get name of a specific user, email, display name, etc",
        inputSchema: {
          username: z
            .string()
            .describe("user name or email(e.g. aaa.bbb@xxx.com, or wendy li)"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const users = await this.jiraApiService.getUserInfo(args);
        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatUserDetails(users),
            },
          ],
        };
      },
    );

    // Get User ID Tool
    this.server.registerTool(
      "get_user_id",
      {
        title: "Get User ID",
        description:
          "Get id of a specific user, which can use as assignee. But it will only return the 1st matching user. So you need provide the user name or email as accurate as you can.",
        inputSchema: {
          username: z
            .string()
            .describe(
              "user name or email(e.g. aaa.bbb@xxx.com, or wendy li), please provide the user name or email as accurate as you can",
            ),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService || !this.formatterService) {
          throw new Error("Services not initialized");
        }

        const users = await this.jiraApiService.getUserInfo(args);
        return {
          content: [
            {
              type: "text",
              text: this.formatterService.formatUserId(users),
            },
          ],
        };
      },
    );

    // Get Field Metadata Tool
    this.server.registerTool(
      "get_field_metadata",
      {
        title: "Get Field Metadata",
        description: "Get metadata for a specific field",
        inputSchema: {
          field_id: z.string().describe("Field ID (e.g., customfield_10006)"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        const fieldMetadata = await this.jiraApiService.getFieldMetadataById(
          args.field_id,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(fieldMetadata, null, 2),
            },
          ],
        };
      },
    );

    // Get Required Fields Structure Tool
    this.server.registerTool(
      "get_required_fields_structure",
      {
        title: "Get Required Fields Structure",
        description:
          "Get the required fields structure for creating a ticket of a specific type in a project",
        inputSchema: {
          projectKey: z.string().describe("Project key (e.g., MOB, WRK)"),
          type: z
            .string()
            .describe(
              "Issue type (e.g., Test, Epic, Story, Activity, Task, Sub-Task)",
            ),
        },
      },
      async (args) => {
        const fieldsStructure = await this.getRequiredFieldsStructure(
          args.projectKey,
          args.type,
          args,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(fieldsStructure, null, 2),
            },
          ],
        };
      },
    );

    // Get Project Issue Types Tool
    this.server.registerTool(
      "get_project_issue_types",
      {
        title: "Get Project Issue Types",
        description: "Get all issue types for a project",
        inputSchema: {
          projectKey: z.string().describe("Project key (e.g., MOB, WRK)"),
        },
      },
      async (args) => {
        const issueTypes = await this.getProjectIssueTypes(args.projectKey);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(issueTypes, null, 2),
            },
          ],
        };
      },
    );

    // Get Field Metadata By Name Tool
    this.server.registerTool(
      "get_field_metadata_by_name",
      {
        title: "Get Field Metadata By Name",
        description:
          "Get field metadata by field names for a specific issue type in a project",
        inputSchema: {
          fieldNames: z
            .string()
            .describe(
              "Field names - can be a single field name or comma-separated multiple field names (e.g., 'Sprint' or 'Sprint,Epic Name,Test Automation Type')",
            ),
          issueTypeId: z.string().describe("Issue type ID (e.g., '10500')"),
          projectKey: z
            .string()
            .optional()
            .describe(
              "Project key (e.g., MOB, WRK). If not provided, defaults to the first project in jira-config.json",
            ),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        const fieldMetadata = await this.jiraApiService.getFieldMetadataByName(
          args.fieldNames,
          args.issueTypeId,
          args.projectKey,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(fieldMetadata, null, 2),
            },
          ],
        };
      },
    );

    // Get Issue Sprint Values Tool
    this.server.registerTool(
      "get_issue_sprint_values",
      {
        title: "Get Issue Sprint Values",
        description: "Get sprint values for a specific issue",
        inputSchema: {
          issueKey: z.string().describe("Issue key (e.g., MOB-123)"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        const sprintValues = await this.jiraApiService.getIssueSprintValues(
          args.issueKey,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(sprintValues, null, 2),
            },
          ],
        };
      },
    );

    // Get Project Sprint Values Tool
    this.server.registerTool(
      "get_project_sprint_values",
      {
        title: "Get Project Sprint Values",
        description:
          "Get sprint values for a specific project.If not provided, defaults to the first project in jira-config.json",
        inputSchema: {
          projectKey: z
            .string()
            .optional()
            .describe(
              "Project key (e.g., MOB, WRK). If not provided, defaults to the first project in jira-config.json",
            ),
          maxResults: z
            .number()
            .optional()
            .describe("Maximum number of results to return (default: 50)"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        const targetProjectKey =
          args.projectKey || (await this.configService.loadProjectKey());
        if (!targetProjectKey) {
          throw new Error("Failed to determine project key");
        }
        const sprintValues = await this.jiraApiService.getProjectSprintValues(
          targetProjectKey,
          args.maxResults,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(sprintValues, null, 2),
            },
          ],
        };
      },
    );

    // Update Issue Sprint Tool
    this.server.registerTool(
      "update_issue_sprint",
      {
        title: "Update Issue Sprint",
        description:
          "Update an issue's sprint using the Agile API. This is the proper way to move issues between sprints.",
        inputSchema: {
          issueKey: z.string().describe("Issue key (e.g., MOB-123)"),
          sprintId: z.number().describe("Target sprint ID (e.g., 327033)"),
        },
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        const result = await this.jiraApiService.updateIssueSprint(
          args.issueKey,
          args.sprintId,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    // JQL Examples Tool
    this.server.registerTool(
      "jql_examples",
      {
        title: "Get JQL Examples",
        description:
          "Get practical JQL query examples with current SAP Jira metadata (projects, fields, statuses, etc.). Provides both example queries and metadata to help construct effective JQL searches.",
        inputSchema: {},
      },
      async (args) => {
        await this.initializeServices();

        if (!this.jiraApiService) {
          throw new Error("Services not initialized");
        }

        const examplesData = await this.jiraApiService.getJqlExamples();

        // Format the response for easy reading
        let formattedOutput = "# JQL Query Examples for SAP Jira\n\n";

        formattedOutput += "## 🎯 Ready-to-Use JQL Examples\n\n";
        examplesData.examples.forEach((example, index) => {
          formattedOutput += `### ${index + 1}. ${example.title}\n`;
          formattedOutput += `**JQL:** \`${example.jql}\`\n\n`;
          formattedOutput += `**Description:** ${example.description}\n\n`;
        });

        formattedOutput += "## 📊 Current SAP Jira Metadata\n\n";

        formattedOutput += `**Current User:** ${examplesData.metadata.currentUser}\n\n`;

        formattedOutput += `**Top Projects:** ${examplesData.metadata.topProjects.join(", ")}\n\n`;

        formattedOutput += `**Common Statuses:** ${examplesData.metadata.commonStatuses.join(", ")}\n\n`;

        formattedOutput += `**Priorities:** ${examplesData.metadata.priorities.join(", ")}\n\n`;

        formattedOutput += `**Issue Types:** ${examplesData.metadata.issueTypes.join(", ")}\n\n`;

        if (examplesData.metadata.customFields.length > 0) {
          formattedOutput += "**Sample Custom Fields:**\n";
          examplesData.metadata.customFields.forEach((field) => {
            formattedOutput += `- \`"${field.name}"\` (${field.id})\n`;
          });
          formattedOutput += "\n";
        }

        formattedOutput += "## 💡 JQL Tips for SAP Jira\n\n";
        formattedOutput +=
          "- Use `currentUser()` to find tickets assigned to you\n";
        formattedOutput +=
          "- Date functions: `created >= -7d`, `updated >= -30d`\n";
        formattedOutput += "- Multiple values: `project IN (PTCH, EAS, WSM)`\n";
        formattedOutput +=
          '- Text search: `summary ~ "keyword"` or `description ~ "text"`\n';
        formattedOutput += "- Negation: `status NOT IN (Closed, Resolved)`\n";
        formattedOutput +=
          "- Ordering: `ORDER BY priority DESC, updated DESC`\n";

        return {
          content: [
            {
              type: "text",
              text: formattedOutput,
            },
            {
              type: "text",
              text: JSON.stringify(examplesData, null, 2),
            },
          ],
        };
      },
    );
  }

  /**
   * Run the server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.error("Jira MCP server running on stdio");
  }
}
