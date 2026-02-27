/**
 * Field API module for Jira
 * Handles field metadata operations, field caching, and value formatting
 */
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseJiraApi } from "./base.js";
import { logger } from "../../utils/logger.js";

/**
 * Field API class for managing Jira field metadata
 */
export class FieldApi extends BaseJiraApi {
  /**
   * Initialize field metadata by fetching all available fields
   */
  async initializeFieldMetadata(): Promise<void> {
    try {
      // Get all available fields
      const fieldsResponse = await this.axiosInstance.get("/field");
      this.setAllFieldsCache(fieldsResponse.data);

      // Build field name to ID and ID to name maps
      const nameToId: Record<string, string> = {};
      const idToName: Record<string, string> = {};

      for (const field of this.getAllFieldsCache()) {
        if (field.id && field.name) {
          // Store the mapping
          this.setFieldNameToIdMap(field.name, field.id);
          this.setFieldIdToNameMap(field.id, field.name);

          // Also store lowercase mapping for case-insensitive matching
          this.setFieldNameToIdMap(field.name.toLowerCase(), field.id);

          // Also store in maps for config service
          nameToId[field.name] = field.id;
          idToName[field.id] = field.name;

          // For custom fields, also map the custom ID (e.g., "customfield_10240")
          if (field.custom && field.id.startsWith("customfield_")) {
            const customId = field.id;
            nameToId[field.name] = customId;
            idToName[customId] = field.name;
          }
        }
      }

      // Update the config service with the mappings
      this.configService.updateFieldMappings(nameToId, idToName);
    } catch (error) {
      logger.error("Error initializing field metadata:", error);
    }
  }

  /**
   * Get issue type ID from project
   * @param typeName Issue type name
   * @returns Issue type ID
   */
  async getIssueTypeId(typeName: string): Promise<string> {
    try {
      const metaResponse = await this.axiosInstance.get(
        `/issue/createmeta/${this.projectKey}/issuetypes`,
      );

      const project = metaResponse.data.values;
      if (!project) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Project ${this.projectKey} not found`,
        );
      }

      const issueType = project.find(
        (t: any) => t.name.toLowerCase() === typeName.toLowerCase(),
      );
      if (!issueType) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Issue type "${typeName}" not found. Available types: ${project
            .map((t: any) => t.name)
            .join(", ")}`,
        );
      }
      return issueType.id;
    } catch (error) {
      this.handleApiError(error);
      throw error; // This will never be reached due to handleApiError, but TypeScript needs it
    }
  }

  /**
   * Get field metadata for an issue type
   * @param issueTypeId Issue type ID
   * @returns Field metadata
   */
  async getFieldMetadata(issueTypeId: string): Promise<Record<string, any>> {
    try {
      logger.debug(`[getFieldMetadata] Called for issueTypeId: ${issueTypeId}`);

      // Check if we have cached metadata for this issue type
      if (this.fieldMetadataCache[issueTypeId]) {
        logger.debug(`[getFieldMetadata] Returning cached metadata`);
        return this.fieldMetadataCache[issueTypeId];
      }

      // Ensure we have the all fields cache
      if (this.allFieldsCache.length === 0) {
        logger.debug(
          `[getFieldMetadata] allFieldsCache is empty, fetching from /field`,
        );
        const interceptorCount =
          (this.axiosInstance.interceptors.request as any).handlers?.length ||
          0;
        logger.debug(
          `[getFieldMetadata] Request interceptors count before GET /field: ${interceptorCount}`,
        );
        const fieldsResponse = await this.axiosInstance.get("/field");
        this.setAllFieldsCache(fieldsResponse.data);

        // Build field name to ID and ID to name maps from all fields
        for (const field of this.allFieldsCache) {
          if (field.id && field.name) {
            this.setFieldNameToIdMap(field.name, field.id);
            this.setFieldIdToNameMap(field.id, field.name);
            this.setFieldNameToIdMap(field.name.toLowerCase(), field.id);
          }
        }
      }

      // Get issue type specific metadata
      logger.debug(
        `[getFieldMetadata] Fetching metadata for issue type from /issue/createmeta`,
      );
      const interceptorCount2 =
        (this.axiosInstance.interceptors.request as any).handlers?.length || 0;
      logger.debug(
        `[getFieldMetadata] Request interceptors count before GET createmeta: ${interceptorCount2}`,
      );
      const metaResponse = await this.axiosInstance.get(
        `/issue/createmeta/${this.projectKey}/issuetypes/${issueTypeId}`,
      );

      // Create a map of field name to field schema
      const fieldMetadata: Record<string, any> = {};
      const fields = metaResponse.data.values;

      if (fields) {
        for (const field of fields) {
          // Find the field in allFields to get more details
          const fieldDetails = this.allFieldsCache.find(
            (f: any) => f.id === field.fieldId,
          );

          const metadata = {
            id: field.fieldId,
            fieldId: field.fieldId, // Add fieldId for consistency
            name: field.name,
            required: field.required,
            schema: field.schema,
            allowedValues: field.allowedValues,
            custom: fieldDetails?.custom || false,
            customId: fieldDetails?.customId || null,
            operations: field.operations || [],
          };

          // Store metadata by field ID
          fieldMetadata[field.fieldId] = metadata;

          // Also store by field name
          fieldMetadata[field.name] = metadata;

          // Also store by lowercase name for case-insensitive matching
          fieldMetadata[field.name.toLowerCase()] = metadata;

          // Update our field mapping caches
          this.setFieldNameToIdMap(field.name, field.fieldId);
          this.setFieldIdToNameMap(field.fieldId, field.name);

          // Also add lowercase mapping for case-insensitive matching
          this.setFieldNameToIdMap(field.name.toLowerCase(), field.fieldId);

          // Update the config service with this mapping
          const nameToIdMap: Record<string, string> = {};
          const idToNameMap: Record<string, string> = {};
          nameToIdMap[field.name] = field.fieldId;
          idToNameMap[field.fieldId] = field.name;
          this.configService.updateFieldMappings(nameToIdMap, idToNameMap);

          // Log required fields
          if (metadata.required) {
            logger.debug(`Required field: ${field.name} (${field.fieldId})`);
          }
        }
      }

      // Log the available fields for debugging
      logger.debug(
        `Available fields for issue type ${issueTypeId}:`,
        Object.keys(fieldMetadata).filter(
          (key) => !key.includes(".") && isNaN(Number(key)),
        ),
      );

      // Cache the metadata
      this.setFieldMetadataCache(issueTypeId, fieldMetadata);

      return fieldMetadata;
    } catch (error) {
      logger.error("Error getting field metadata:", error);
      return {}; // Return empty object on error
    }
  }

  /**
   * Get field metadata by ID
   * @param fieldId Field ID
   * @returns Field metadata
   */
  async getFieldMetadataById(fieldId: string): Promise<any> {
    try {
      // Check if we have the field in our cache
      if (this.allFieldsCache.length === 0) {
        const fieldsResponse = await this.axiosInstance.get("/field");
        this.setAllFieldsCache(fieldsResponse.data);
      }

      const field = this.allFieldsCache.find((f: any) => f.id === fieldId);

      if (!field) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Field ${fieldId} not found`,
        );
      }

      return field;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
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
    try {
      // Use the provided project key or fall back to the current one
      const targetProjectKey = projectKey || this.projectKey;

      // Get field metadata for this issue type
      let fieldMetadata: Record<string, any>;

      if (projectKey && projectKey !== this.projectKey) {
        // Create a new FieldApi instance if we need to use a different project
        const fieldApi = new FieldApi(
          this.jiraDomain,
          projectKey,
          this.templates,
          this.configService,
          this.authManager,
        );
        await fieldApi.initializeFieldMetadata();
        fieldMetadata = await fieldApi.getFieldMetadata(issueTypeId);
      } else {
        fieldMetadata = await this.getFieldMetadata(issueTypeId);
      }

      // Parse field names (handle comma-separated values)
      const fieldNameList = fieldNames
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      if (/^\d+$/.test(issueTypeId)) {
        // do noting
      } else {
        // issueTypeId is not pure number
        issueTypeId = await this.getIssueTypeId(issueTypeId);
      }

      const result: any = {
        projectKey: targetProjectKey,
        issueTypeId: issueTypeId,
        fields: {},
      };
      logger.debug(
        "getFieldMetadataByName =======>fieldMetadata:",
        JSON.stringify(fieldMetadata, null, 2),
      );
      // Find metadata for each requested field
      for (const fieldName of fieldNameList) {
        let foundField = null;
        let fieldId = null;

        // Try to find the field by exact name match (case-sensitive)
        for (const [metaFieldId, metadata] of Object.entries(fieldMetadata)) {
          if (
            typeof metadata === "object" &&
            metadata !== null &&
            metadata.name === fieldName
          ) {
            foundField = metadata;
            fieldId = metaFieldId;
            break;
          }
        }

        // If not found, try case-insensitive match
        if (!foundField) {
          for (const [metaFieldId, metadata] of Object.entries(fieldMetadata)) {
            if (
              typeof metadata === "object" &&
              metadata !== null &&
              metadata.name &&
              metadata.name.toLowerCase() === fieldName.toLowerCase()
            ) {
              foundField = metadata;
              fieldId = metaFieldId;
              break;
            }
          }
        }

        // If still not found, try to find by field ID directly
        if (!foundField && fieldName.startsWith("customfield_")) {
          foundField = fieldMetadata[fieldName];
          fieldId = fieldName;
        }

        // If still not found, try partial matching
        if (!foundField) {
          for (const [metaFieldId, metadata] of Object.entries(fieldMetadata)) {
            if (
              typeof metadata === "object" &&
              metadata !== null &&
              metadata.name
            ) {
              const metaFieldName = metadata.name.toLowerCase();
              const searchFieldName = fieldName.toLowerCase();

              // Check if field names contain each other
              if (
                metaFieldName.includes(searchFieldName) ||
                searchFieldName.includes(metaFieldName)
              ) {
                foundField = metadata;
                fieldId = metaFieldId;
                break;
              }
            }
          }
        }

        if (foundField && fieldId) {
          result.fields[fieldName] = {
            id: fieldId,
            name: foundField.name,
            required: foundField.required || false,
            schema: foundField.schema,
            allowedValues: foundField.allowedValues,
            custom: foundField.custom || false,
            operations: foundField.operations || [],
          };
        } else {
          result.fields[fieldName] = {
            error: `Field '${fieldName}' not found in issue type '${issueTypeId}' for project '${targetProjectKey}'`,
          };
        }
      }

      return result;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Format a value based on field metadata
   * @param fieldId Field ID
   * @param value Field value
   * @param metadata Field metadata
   * @returns Formatted value
   */
  formatValueBasedOnMetadata(
    fieldId: string,
    value: any,
    metadata: any,
  ): any {
    // If the value is empty string, return undefined so it will be omitted
    if (value === "") {
      return undefined;
    }

    // If the value is already an object (but not an array), use it as is
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value;
    }

    // Check if the field has operations that indicate how it should be formatted
    const operations = metadata.operations || [];
    const canSetValue = operations.includes("set");

    // Get the schema type from metadata
    const schemaType = metadata.schema?.type;

    // Format based on schema type
    switch (schemaType) {
      case "array":
        // Handle array fields
        const itemType = metadata.schema?.items;

        // If value is already an array, process each element
        if (Array.isArray(value)) {
          return value.map((item: any) => {
            // If item is already an object with required structure, use it
            if (typeof item === "object" && item !== null) {
              // Check if it already has the correct structure
              if (itemType === "component" && (item.id || item.name)) {
                return item;
              } else if (
                itemType === "option" &&
                (item.id || item.value || item.name)
              ) {
                return item;
              }
              return item;
            }
            // Otherwise, format based on item type
            if (itemType === "string") {
              return item;
            } else if (itemType === "component") {
              // For components, if it's a number or numeric string, use id; otherwise use name
              const itemStr = String(item);
              return /^\d+$/.test(itemStr)
                ? { id: itemStr }
                : { name: itemStr };
            } else if (itemType === "option") {
              return { name: String(item) };
            } else {
              return { value: String(item) };
            }
          });
        }

        // If the value contains commas, it might be a comma-separated list
        if (typeof value === "string" && value.includes(",")) {
          const parts = value.split(",").map((part: string) => part.trim());

          // Format each part based on item type
          if (itemType === "string") {
            return parts;
          } else if (itemType === "component") {
            return parts.map((part: string) =>
              /^\d+$/.test(part) ? { id: part } : { name: part },
            );
          } else if (itemType === "option") {
            return parts.map((part: string) => ({ name: part }));
          } else {
            return parts.map((part: string) => ({ value: part }));
          }
        }

        // Single value
        if (itemType === "string") {
          return [value];
        } else if (itemType === "component") {
          const valueStr = String(value);
          return [
            /^\d+$/.test(valueStr) ? { id: valueStr } : { name: valueStr },
          ];
        } else if (itemType === "option") {
          return [{ name: value }];
        } else {
          return [{ value }];
        }

      case "option":
      case "priority":
      case "status":
        // These types use id or value property if available in allowed values
        if (metadata.allowedValues && Array.isArray(metadata.allowedValues)) {
          // Try to find a matching allowed value
          const matchingValue = metadata.allowedValues.find((allowed: any) => {
            if (
              allowed.value &&
              allowed.value.toString().toLowerCase() ===
                value.toString().toLowerCase()
            ) {
              return true;
            }
            if (
              allowed.name &&
              allowed.name.toString().toLowerCase() ===
                value.toString().toLowerCase()
            ) {
              return true;
            }
            if (
              allowed.id &&
              allowed.id.toString().toLowerCase() ===
                value.toString().toLowerCase()
            ) {
              return true;
            }
            return false;
          });

          if (matchingValue) {
            return matchingValue;
          }
        }

        // Default to name property
        return { name: value };

      case "user":
        // User fields use name property for user identification
        // Check if the value is already in the correct format
        if (typeof value === "object" && value !== null && "name" in value) {
          return value;
        }
        // For user fields, use name property
        return { name: value };

      case "string":
      case "date":
      case "datetime":
      case "number":
      case "integer":
        // Simple types use direct value
        return value;

      default:
        // For custom fields or unknown types, check if there are allowed values
        if (metadata.allowedValues && Array.isArray(metadata.allowedValues)) {
          // Try to find a matching allowed value
          const matchingValue = metadata.allowedValues.find((allowed: any) => {
            if (
              allowed.value &&
              allowed.value.toString().toLowerCase() ===
                value.toString().toLowerCase()
            ) {
              return true;
            }
            if (
              allowed.name &&
              allowed.name.toString().toLowerCase() ===
                value.toString().toLowerCase()
            ) {
              return true;
            }
            if (
              allowed.id &&
              allowed.id.toString().toLowerCase() ===
                value.toString().toLowerCase()
            ) {
              return true;
            }
            return false;
          });

          if (matchingValue) {
            return matchingValue;
          }

          // If no exact match, check for nested values (like Test Automation Type)
          if (typeof value === "string" && value.includes(" - ")) {
            const parts = value.split(" - ");
            if (parts.length === 2) {
              const parentValue = parts[0].trim();
              const childValue = parts[1].trim();

              // Find parent match
              const parentMatch = metadata.allowedValues.find(
                (allowed: any) =>
                  allowed.value &&
                  allowed.value.toString().toLowerCase() ===
                    parentValue.toLowerCase(),
              );

              if (
                parentMatch &&
                parentMatch.children &&
                Array.isArray(parentMatch.children)
              ) {
                // Find child match
                const childMatch = parentMatch.children.find(
                  (child: any) =>
                    child.value &&
                    child.value.toString().toLowerCase() ===
                      childValue.toLowerCase(),
                );

                if (childMatch) {
                  return {
                    value: parentMatch.value,
                    child: { value: childMatch.value },
                  };
                }
              }
            }
          }
        }
        // For custom fields, check the operations to determine the format
        if (fieldId.startsWith("customfield_")) {
          // Check if the field has operations that indicate how it should be formatted
          const operations = metadata.operations || [];

          // If the field supports 'set' operation directly, use the value as is
          if (operations.includes("set")) {
            return value;
          }
          // Otherwise use { value } structure for custom fields to ensure consistency
          else {
            return { value };
          }
        }

        // For unknown fields, use the value directly
        return value;
    }
  }

  /**
   * Find the Epic Name field ID
   * @param fieldMetadata Field metadata
   * @returns Epic Name field ID
   */
  findEpicNameFieldId(
    fieldMetadata: Record<string, any>,
  ): string | undefined {
    // Look for a field with "Epic Name" in its name
    for (const [fieldId, metadata] of Object.entries(fieldMetadata)) {
      if (
        typeof metadata === "object" &&
        metadata !== null &&
        "name" in metadata
      ) {
        const fieldName = (metadata as any).name;
        if (
          typeof fieldName === "string" &&
          (fieldName.toLowerCase() === "epic name" ||
            (fieldName.toLowerCase().includes("epic") &&
              fieldName.toLowerCase().includes("name")))
        ) {
          return fieldId;
        }
      }
    }

    // Look for any field that might be an Epic Name field based on field schema
    for (const [fieldId, metadata] of Object.entries(fieldMetadata)) {
      if (
        typeof metadata === "object" &&
        metadata !== null &&
        metadata.schema &&
        metadata.schema.type === "string" &&
        fieldId.startsWith("customfield_")
      ) {
        // Check if this field is used in any Epic template
        for (const template of this.templates) {
          if (template.type.toLowerCase() === "epic" && fieldId in template) {
            return fieldId;
          }
        }
      }
    }

    return undefined;
  }
}
