/**
 * Jira API service
 */
import axios, { AxiosInstance, AxiosError } from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
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
  JiraTemplate,
  StoredCookie,
} from "../models/types.js";
import { ConfigService } from "./config-service.js";
import { AuthManager } from "./auth-manager.js";

import { logger } from "../utils/logger.js";
/**
 * Jira API service class
 */
export class JiraApiService {
  private axiosInstance: AxiosInstance;
  private projectKey: string;
  private templates: JiraTemplate[];
  private configService: ConfigService;
  private fieldMetadataCache: Record<string, any> = {};
  private allFieldsCache: any[] = [];
  private fieldNameToIdMap: Record<string, string> = {};
  private fieldIdToNameMap: Record<string, string> = {};
  private authManager: AuthManager;
  private readonly jiraDomain: string;
  private readonly BASE_URL: string;

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
    this.BASE_URL = `https://${jiraDomain}`;
    this.authManager = authManager;
    this.projectKey = projectKey;
    this.templates = templates;
    this.configService = configService;

    //raw client without auth string injected
    this.axiosInstance = axios.create({
      baseURL: `${this.BASE_URL}/rest/api/2`,
      timeout: 30000, // Longer timeout for full page loads
      headers: {
        // Browser-like headers, NOT AJAX headers
        "Content-Type": "application/json",
        "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        "cache-control": "no-cache",
        dnt: "1",
        pragma: "no-cache",
        "sec-ch-ua":
          '"Chromium";v="140", "Not=A?Brand";v="24", "Microsoft Edge";v="140"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
      },
    });

    // Always register request interceptor as fallback
    logger.info("[initializeApiClient] Registering request interceptor");
    this.axiosInstance.interceptors.request.use(async (config) => {
      logger.debug(
        `[Interceptor] Request to ${config.method?.toUpperCase()} ${config.url}`,
      );

      // Only load cookies from disk if header doesn't have them
      if (!config.headers["Cookie"]) {
        logger.debug("[Interceptor] No cookies in header, loading from disk");
        const currentCookies = await this.authManager.getCookies();

        if (currentCookies && currentCookies.length > 0) {
          const cookieString = currentCookies
            .map((cookie: StoredCookie) => `${cookie.name}=${cookie.value}`)
            .join("; ");
          config.headers["Cookie"] = cookieString;
          logger.debug(
            `[Interceptor] Loaded ${currentCookies.length} cookies from disk`,
          );
        } else {
          logger.warn("[Interceptor] No cookies found on disk");
        }
      } else {
        logger.debug("[Interceptor] Using existing cookies from header");
      }

      // Add CSRF protection headers for write operations
      if (
        config.method &&
        ["post", "put", "delete"].includes(config.method.toLowerCase())
      ) {
        config.headers["X-Requested-With"] = "XMLHttpRequest";
        config.headers["Origin"] = this.BASE_URL;
        if (config.url) {
          config.headers["Referer"] = `${this.BASE_URL}/`;
        }
      }

      return config;
    });

    // Add response interceptor to handle auth errors
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug(
          `[Response Interceptor] Success response: ${response.status}`,
        );
        return response;
      },
      async (error) => {
        logger.debug(
          `[Response Interceptor] Error response: ${error.response?.status}`,
        );
        // now only treat 401 as auth issue (cookie is wrong), 403 is authorization issue, will not drop cookie.
        if (error.response && error.response.status === 401) {
          logger.warn(
            `[Response Interceptor] Auth error ${error.response.status}, clearing cached cookies`,
          );
          // Clear cookies from default headers to force reload on next request
          delete this.axiosInstance.defaults.headers.common["Cookie"];
          logger.debug(
            `[Response Interceptor] Cookies cleared from default headers due to auth issue happens`,
          );
        }
        return Promise.reject(error);
      },
    );

    logger.debug("[initializeApiClient] Registering request interceptor DONE!");
  }

  async initialize(): Promise<any> {
    // Initialize http client for API call
    await this.initializeApiClient();

    // Initialize field metadata after api client is ready
    await this.initializeFieldMetadata();
  }

  private async initializeApiClient(): Promise<any> {
    logger.info("[initializeApiClient] Initializing API client");
    // Determine authentication type based on the input
    const authType = this.authManager.getAuthType();

    if (authType == "cookies") {
      logger.info("[initializeApiClient] Using cookie-based authentication");

      // Try to load initial cookies and set as default
      const storedCookies = await this.authManager.getCookies();
      if (storedCookies && storedCookies.length > 0) {
        const cookieString = storedCookies
          .map((cookie: StoredCookie) => `${cookie.name}=${cookie.value}`)
          .join("; ");
        this.axiosInstance.defaults.headers.common["Cookie"] = cookieString;
        logger.info(
          `✅ Loaded ${storedCookies.length} cookies into default headers`,
        );
      } else {
        logger.info("No cookies found initially - will load on first request");
      }

      logger.info("[initializeApiClient] Interceptors registered successfully");
    } else {
      // API token-based authentication
      this.axiosInstance.defaults.headers.common["Authorization"] =
        `Bearer ${this.authManager.getApiToken()}`;
      logger.info(`✅ API Token injected`);
    }
  }

  /**
   * Initialize field metadata by fetching all available fields
   */
  private async initializeFieldMetadata(): Promise<void> {
    try {
      // Get all available fields
      const fieldsResponse = await this.axiosInstance.get("/field");
      this.allFieldsCache = fieldsResponse.data;

      // Build field name to ID and ID to name maps
      const nameToId: Record<string, string> = {};
      const idToName: Record<string, string> = {};

      for (const field of this.allFieldsCache) {
        if (field.id && field.name) {
          // Store the mapping
          this.fieldNameToIdMap[field.name] = field.id;
          this.fieldIdToNameMap[field.id] = field.name;

          // Also store lowercase mapping for case-insensitive matching
          this.fieldNameToIdMap[field.name.toLowerCase()] = field.id;

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
        this.allFieldsCache = fieldsResponse.data;

        // Build field name to ID and ID to name maps from all fields
        for (const field of this.allFieldsCache) {
          if (field.id && field.name) {
            this.fieldNameToIdMap[field.name] = field.id;
            this.fieldIdToNameMap[field.id] = field.name;
            this.fieldNameToIdMap[field.name.toLowerCase()] = field.id;
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
          this.fieldNameToIdMap[field.name] = field.fieldId;
          this.fieldIdToNameMap[field.fieldId] = field.name;

          // Also add lowercase mapping for case-insensitive matching
          this.fieldNameToIdMap[field.name.toLowerCase()] = field.fieldId;

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
      this.fieldMetadataCache[issueTypeId] = fieldMetadata;

      return fieldMetadata;
    } catch (error) {
      logger.error("Error getting field metadata:", error);
      return {}; // Return empty object on error
    }
  }

  /**
   * Map a field name to its Jira field ID using dynamic metadata
   * @param fieldName Field name (human-readable or Jira field ID)
   * @returns Jira field ID
   */
  private mapFieldNameToId(fieldName: string): string {
    // If the field name is already a Jira field ID, return it
    if (fieldName.startsWith("customfield_")) {
      return fieldName;
    }

    // Check our internal cache first
    if (this.fieldNameToIdMap[fieldName]) {
      return this.fieldNameToIdMap[fieldName];
    }

    // Try lowercase version for case-insensitive matching
    if (this.fieldNameToIdMap[fieldName.toLowerCase()]) {
      return this.fieldNameToIdMap[fieldName.toLowerCase()];
    }

    // Fall back to config service
    return this.configService.mapFieldNameToId(fieldName);
  }

  /**
   * Format a value based on field metadata
   * @param fieldId Field ID
   * @param value Field value
   * @param metadata Field metadata
   * @returns Formatted value
   */
  private formatValueBasedOnMetadata(
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
  private findEpicNameFieldId(
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

  /**
   * Get current logged-in user
   * @returns Current user information
   */
  async getCurrentUser(): Promise<any> {
    try {
      const response = await this.axiosInstance.get("/myself");
      return response.data;
    } catch (error) {
      logger.error("Error getting current user:", error);
      return null;
    }
  }

  /**
   * Create a new issue
   * @param request Create issue request
   * @param template Template to use for the issue
   * @returns Created issue
   */
  async createIssue(
    request: CreateIssueRequest,
    template: JiraTemplate,
  ): Promise<any> {
    try {
      logger.info(
        `[createIssue] Called with request summary: "${request.summary}"`,
      );
      logger.debug(`[createIssue] Full request: ${JSON.stringify(request)}`);
      logger.debug(`[createIssue] Using template type: ${template.type}`);

      // Get current user if assignee is not provided
      let finalAssignee = request.assignee || template.assignee;
      
      // If no assignee provided, try to get current user
      if (!finalAssignee) {
        try {
          const currentUser = await this.getCurrentUser();
          if (currentUser && currentUser.name) {
            finalAssignee = currentUser.name;
            logger.info(`Using current logged-in user as assignee: ${finalAssignee}`);
          }
        } catch (error) {
          logger.info("Could not get current user, proceeding without assignee");
        }
      }

      // Extract common fields with defaults from template
      const {
        summary,
        description = summary,
        type = template.type,
        assignee = finalAssignee,
        reporter,
        ...dynamicFields // All other fields provided by the user
      } = request;

      // Store sprint value if provided in the request for post-creation assignment
      let sprintValueFromRequest = null;

      // Check for sprint value in multiple possible locations
      if (request.sprint) {
        sprintValueFromRequest = request.sprint;
        logger.error(`Found sprint in request:`, sprintValueFromRequest);
      } else if (request.customfield_12740) {
        sprintValueFromRequest = request.customfield_12740;
        logger.error(
          `Found customfield_12740 in request:`,
          sprintValueFromRequest,
        );
      } else if (dynamicFields.sprint) {
        sprintValueFromRequest = dynamicFields.sprint;
        logger.error(`Found sprint in dynamicFields:`, sprintValueFromRequest);
      } else if (dynamicFields.customfield_12740) {
        sprintValueFromRequest = dynamicFields.customfield_12740;
        logger.error(
          `Found customfield_12740 in dynamicFields:`,
          sprintValueFromRequest,
        );
      }

      // Check if issuetype is provided in the template
      let issueTypeId: string;

      if (
        template.issuetype &&
        typeof template.issuetype === "object" &&
        "id" in template.issuetype &&
        template.issuetype.id
      ) {
        issueTypeId = String(template.issuetype.id);
      } else {
        // If issuetype is not provided in the template, query it from the project
        issueTypeId = await this.getIssueTypeId(type);
      }

      // Get field metadata for this issue type to understand the required structure
      const fieldMetadata = await this.getFieldMetadata(issueTypeId);

      logger.info(
        `Creating ${type} issue in project ${this.projectKey} with issue type ID ${issueTypeId}`,
      );

      // Log all template fields for debugging
      logger.info(
        "Template fields:",
        Object.keys(template).filter(
          (key) =>
            ![
              "summary",
              "description",
              "type",
              "issuetype",
              "assignee",
            ].includes(key),
        ),
      );

      // Log all dynamic fields from user input for debugging
      logger.info("User input fields:", Object.keys(dynamicFields));

      // Build the fields object starting with required fields
      const fields: any = {};

      // Add project field
      fields.project = {
        key: this.projectKey,
      };

      // Add issuetype field
      fields.issuetype = {
        id: issueTypeId,
      };

      // Process summary field
      if (summary) {
        fields.summary = summary;
      }

      // Process description field
      if (description) {
        fields.description = description;
      }

      // Process assignee field
      if (assignee) {
        const assigneeMetadata = fieldMetadata["assignee"];
        if (assigneeMetadata) {
          fields.assignee = this.formatValueBasedOnMetadata(
            "assignee",
            assignee,
            assigneeMetadata,
          );
          logger.info(
            `Added assignee field with formatted value:`,
            fields.assignee,
          );
        } else {
          logger.info(
            `Assignee field not found in metadata, skipping assignee field`,
          );
          // Skip assignee field if it's not available in the field metadata
        }
      }

      // Process reporter field
      if (reporter) {
        const reporterMetadata = fieldMetadata["reporter"];
        if (reporterMetadata) {
          fields.reporter = this.formatValueBasedOnMetadata(
            "reporter",
            reporter,
            reporterMetadata,
          );
          logger.info(
            `Added reporter field with formatted value:`,
            fields.reporter,
          );
        } else {
          logger.info(
            `Reporter field not found in metadata, skipping reporter field`,
          );
          // Skip reporter field if it's not available in the field metadata
        }
      }

      // Process all template fields first
      for (const [key, value] of Object.entries(template)) {
        // Skip common fields that we've already handled
        if (
          ["summary", "description", "type", "issuetype", "assignee"].includes(
            key,
          )
        ) {
          continue;
        }

        // Skip if no value
        if (value === undefined || value === null || value === "") {
          continue;
        }

        // Skip if value is an object with an empty string value
        if (
          typeof value === "object" &&
          value !== null &&
          "value" in value &&
          value.value === ""
        ) {
          logger.info(`Skipping template field ${key} with empty string value`);
          continue;
        }

        // Map the field name to its ID
        const fieldId = this.mapFieldNameToId(key);

        // Get metadata for this field
        const metadata =
          fieldMetadata[fieldId] ||
          fieldMetadata[key] ||
          fieldMetadata[key.toLowerCase()];

        // Skip fields that don't have metadata - they might not be available on the appropriate screen
        if (!metadata) {
          logger.info(
            `Skipping template field ${key} (mapped to ${fieldId}) as it has no metadata and might not be available on the appropriate screen`,
          );
          continue;
        }

        // Special handling for labels field - automatically add "mcp-jira" label
        if (key.toLowerCase() === "labels" || fieldId === "labels") {
          let labelsArray: string[] = [];

          // Parse existing labels from template
          if (Array.isArray(value)) {
            labelsArray = value.map((label) =>
              typeof label === "string"
                ? label
                : label.name || label.value || String(label),
            );
          } else if (typeof value === "string") {
            labelsArray = value
              .split(",")
              .map((label) => label.trim())
              .filter((label) => label !== "");
          } else if (typeof value === "object" && value !== null) {
            if ("name" in value) {
              labelsArray = [value.name];
            } else if ("value" in value) {
              labelsArray = [value.value];
            }
          }

          // Add "mcp-jira" label if not already present
          if (
            !labelsArray.some((label) => label.toLowerCase() === "mcp-jira")
          ) {
            labelsArray.push("mcp-jira");
          }

          // Format labels according to metadata
          fields[fieldId] = this.formatValueBasedOnMetadata(
            fieldId,
            labelsArray,
            metadata,
          );
          logger.info(
            `Added template field ${key} (mapped to ${fieldId}) with mcp-jira label included:`,
            fields[fieldId],
          );
        } else {
          // Format the value based on metadata
          fields[fieldId] = this.formatValueBasedOnMetadata(
            fieldId,
            value,
            metadata,
          );
          logger.info(
            `Added template field ${key} (mapped to ${fieldId}) with formatted value:`,
            fields[fieldId],
          );
        }
      }

      // Process user-provided dynamic fields to override template values
      for (const [key, value] of Object.entries(dynamicFields)) {
        // Skip if no value is provided
        if (value === undefined || value === null || value === "") {
          continue;
        }

        // Special handling for sprint field during creation
        if (key === "customfield_12740" || key.toLowerCase() === "sprint") {
          // Store sprint value for post-creation assignment
          (dynamicFields as any)._sprintValue = value;
          continue;
        }

        // Try to find the field in metadata by exact name, case-insensitive name, or ID mapping
        let fieldId = key;
        let metadata = fieldMetadata[key];

        // If not found by exact name, try case-insensitive matching
        if (!metadata) {
          metadata = fieldMetadata[key.toLowerCase()];
          if (metadata) {
            fieldId = metadata.id;
          }
        }

        // If still not found, try to map the key to a field ID
        if (!metadata) {
          const mappedId = this.mapFieldNameToId(key);
          if (mappedId !== key) {
            fieldId = mappedId;
            metadata = fieldMetadata[fieldId];
          }
        }

        logger.error(
          `Processing user field "${key}" with ID "${fieldId}", metadata found: ${!!metadata}`,
        );

        // Skip fields that don't have metadata - they might not be available on the appropriate screen
        if (!metadata) {
          logger.error(
            `Skipping user field ${key} (mapped to ${fieldId}) as it has no metadata and might not be available on the appropriate screen`,
          );
          continue;
        }

        // Special handling for labels field - automatically add "mcp-jira" label
        if (key.toLowerCase() === "labels" || fieldId === "labels") {
          let labelsArray: string[] = [];

          // Parse existing labels from user input
          if (Array.isArray(value)) {
            labelsArray = value.map((label) =>
              typeof label === "string"
                ? label
                : label.name || label.value || String(label),
            );
          } else if (typeof value === "string") {
            labelsArray = value
              .split(",")
              .map((label) => label.trim())
              .filter((label) => label !== "");
          } else if (typeof value === "object" && value !== null) {
            if ("name" in value) {
              labelsArray = [value.name];
            } else if ("value" in value) {
              labelsArray = [value.value];
            }
          }

          // Add "mcp-jira" label if not already present
          if (
            !labelsArray.some((label) => label.toLowerCase() === "mcp-jira")
          ) {
            labelsArray.push("mcp-jira");
          }

          // Format labels according to metadata
          fields[fieldId] = this.formatValueBasedOnMetadata(
            fieldId,
            labelsArray,
            metadata,
          );
          logger.error(
            `Added user field ${key} (mapped to ${fieldId}) with mcp-jira label included:`,
            fields[fieldId],
          );
        } else {
          // Format the value based on metadata
          fields[fieldId] = this.formatValueBasedOnMetadata(
            fieldId,
            value,
            metadata,
          );
          logger.error(
            `Added user field ${key} (mapped to ${fieldId}) with formatted value:`,
            fields[fieldId],
          );
        }
      }

      // Special handling for Epic Name field if this is an Epic
      if (type.toLowerCase() === "epic") {
        const epicNameFieldId = this.findEpicNameFieldId(fieldMetadata);
        if (epicNameFieldId) {
          const epicName = dynamicFields["Epic Name"] || summary;
          if (epicName) {
            fields[epicNameFieldId] = epicName;
            logger.error(
              `Added Epic Name field (${epicNameFieldId}):`,
              epicName,
            );
          }
        }
      }

      // Ensure "mcp-jira" label is always added if labels field is available
      const labelsFieldId = "labels";
      const labelsMetadata =
        fieldMetadata[labelsFieldId] ||
        fieldMetadata["Labels"] ||
        fieldMetadata["labels"];

      if (labelsMetadata && !fields[labelsFieldId]) {
        // Labels field exists but hasn't been set yet, add just the "mcp-jira" label
        fields[labelsFieldId] = this.formatValueBasedOnMetadata(
          labelsFieldId,
          ["mcp-jira"],
          labelsMetadata,
        );
        logger.error(
          `Added default mcp-jira label to labels field:`,
          fields[labelsFieldId],
        );
      }

      // Check for required fields based on field metadata
      // First, collect unique field IDs (avoid duplicates from display name keys)
      const processedFieldIds = new Set<string>();

      for (const [key, metadata] of Object.entries(fieldMetadata)) {
        // Only process entries where the key is the actual fieldId
        // Skip entries that are stored by display name or lowercase name
        if (!metadata.fieldId || key !== metadata.fieldId) {
          continue;
        }

        const fieldId = metadata.fieldId;

        // Skip if we've already processed this field ID
        if (processedFieldIds.has(fieldId)) {
          continue;
        }
        processedFieldIds.add(fieldId);

        // Skip if the field is already set
        if (fields[fieldId]) {
          continue;
        }

        // Skip common fields that we've already handled
        if (
          [
            "summary",
            "description",
            "project",
            "issuetype",
            "assignee",
            "Project",
            "Issue Type",
            "issue type",
          ].includes(fieldId)
        ) {
          continue;
        }

        // Check if the field is required
        if (metadata.required) {
          logger.error(
            `Field ${fieldId} (${metadata.name}) is required but missing`,
          );

          // Try to find a value for this field
          let fieldValue = null;

          // Look for the field in the original template
          for (const [key, value] of Object.entries(template)) {
            if (key === fieldId || this.mapFieldNameToId(key) === fieldId) {
              if (
                typeof value === "object" &&
                value !== null &&
                "value" in value
              ) {
                fieldValue = value.value;
                logger.error(
                  `Found value for ${fieldId} in template: ${fieldValue}`,
                );
                break;
              } else if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ) {
                fieldValue = value;
                logger.error(
                  `Found value for ${fieldId} in template: ${fieldValue}`,
                );
                break;
              }
            }
          }

          // If not found in template, try to find it in other templates of the same type
          if (fieldValue === null) {
            for (const otherTemplate of this.templates) {
              if (otherTemplate.type === type) {
                for (const [key, value] of Object.entries(otherTemplate)) {
                  if (
                    key === fieldId ||
                    this.mapFieldNameToId(key) === fieldId
                  ) {
                    if (
                      typeof value === "object" &&
                      value !== null &&
                      "value" in value
                    ) {
                      fieldValue = value.value;
                      logger.error(
                        `Found value for ${fieldId} in other template: ${fieldValue}`,
                      );
                      break;
                    } else if (
                      typeof value === "string" ||
                      typeof value === "number" ||
                      typeof value === "boolean"
                    ) {
                      fieldValue = value;
                      logger.error(
                        `Found value for ${fieldId} in other template: ${fieldValue}`,
                      );
                      break;
                    }
                  }
                }
                if (fieldValue !== null) {
                  break;
                }
              }
            }
          }

          // If still not found, try to get it from field metadata
          if (fieldValue === null) {
            if (metadata.allowedValues && metadata.allowedValues.length > 0) {
              const firstAllowedValue = metadata.allowedValues[0];
              if (
                typeof firstAllowedValue === "object" &&
                firstAllowedValue !== null
              ) {
                if ("value" in firstAllowedValue) {
                  fieldValue = firstAllowedValue.value;
                  logger.error(
                    `Using first allowed value for ${fieldId}: ${fieldValue}`,
                  );
                } else if ("name" in firstAllowedValue) {
                  fieldValue = firstAllowedValue.name;
                  logger.error(
                    `Using first allowed value for ${fieldId}: ${fieldValue}`,
                  );
                } else if ("id" in firstAllowedValue) {
                  fieldValue = firstAllowedValue.id;
                  logger.error(
                    `Using first allowed value for ${fieldId}: ${fieldValue}`,
                  );
                }
              }
            }
          }

          // If we found a value, add it to the fields
          if (fieldValue !== null) {
            fields[fieldId] = this.formatValueBasedOnMetadata(
              fieldId,
              fieldValue,
              metadata,
            );
            logger.error(
              `Added required field ${fieldId} with dynamically determined value:`,
              fields[fieldId],
            );
          } else {
            logger.error(
              `Could not find a value for required field ${fieldId}`,
            );
          }
        }
      }

      // Remove fields with empty string values
      for (const [key, value] of Object.entries(fields)) {
        if (
          typeof value === "object" &&
          value !== null &&
          "value" in value &&
          value.value === ""
        ) {
          logger.error(`Removing field ${key} with empty string value`);
          delete fields[key];
        }
      }

      // Remove problematic fields that are not on the appropriate screen
      const problematicFields = [
        "Mobile Required",
        "mobile required",
        "UI Required",
        "ui required",
        "Component/s",
        "component/s",
      ];

      for (const fieldName of problematicFields) {
        if (fields[fieldName]) {
          logger.error(
            `Removing problematic field '${fieldName}' that may not be on the appropriate screen`,
          );
          delete fields[fieldName];
        }

        // // Also check for mapped field IDs
        // const fieldId = this.mapFieldNameToId(fieldName);
        // if (fieldId !== fieldName && fields[fieldId]) {
        //   logger.error(`Removing problematic field ID '${fieldId}' mapped from '${fieldName}'`);
        //   delete fields[fieldId];
        // }
      }

      // Remove stack field if present
      if (fields.stack) {
        logger.error("Removing 'stack' field from request");
        delete fields.stack;
      }
      if (fields.Stack) {
        logger.error("Removing 'Stack' field from request");
        delete fields.Stack;
      }

      // Try to create the issue
      logger.info("[createIssue] Prepared fields for Jira API:");
      logger.info(JSON.stringify(fields, null, 2));

      // Check if cookies exist in default headers
      const hasCookies = !!this.axiosInstance.defaults.headers.common["Cookie"];
      const interceptorCount =
        (this.axiosInstance.interceptors.request as any).handlers?.length || 0;
      logger.debug(`[createIssue] Default headers have cookies: ${hasCookies}`);
      logger.debug(
        `[createIssue] Request interceptors count: ${interceptorCount}`,
      );
      logger.debug("[createIssue] About to POST to /issue endpoint");

      // Log the complete request payload before sending
      const requestPayload = { fields };
      logger.error("[createIssue] Complete request payload:");
      logger.error(JSON.stringify(requestPayload, null, 2));
      logger.error(
        `[createIssue] Number of fields in request: ${Object.keys(fields).length}`,
      );
      logger.error(
        `[createIssue] Field names: ${Object.keys(fields).join(", ")}`,
      );

      const createResponse = await this.axiosInstance.post("/issue", {
        fields,
      });

      logger.info(
        `[createIssue] Issue created successfully with key: ${createResponse.data.key}`,
      );
      logger.debug(`[createIssue] Response status: ${createResponse.status}`);
      const createdIssue = createResponse.data;

      // Handle post-creation sprint assignment if sprint was specified
      let sprintValueToAssign = null;

      // Check for sprint value in different possible locations
      if ((dynamicFields as any)._sprintValue) {
        sprintValueToAssign = (dynamicFields as any)._sprintValue;
        logger.error(
          `Found sprint value in _sprintValue:`,
          sprintValueToAssign,
        );
      } else if (request.sprint) {
        sprintValueToAssign = request.sprint;
        logger.error(
          `Found sprint value in request.sprint:`,
          sprintValueToAssign,
        );
      } else if (request.customfield_12740) {
        sprintValueToAssign = request.customfield_12740;
        logger.error(
          `Found sprint value in request.customfield_12740:`,
          sprintValueToAssign,
        );
      } else if (dynamicFields.sprint) {
        sprintValueToAssign = dynamicFields.sprint;
        logger.error(
          `Found sprint value in dynamicFields.sprint:`,
          sprintValueToAssign,
        );
      } else if (dynamicFields.customfield_12740) {
        sprintValueToAssign = dynamicFields.customfield_12740;
        logger.error(
          `Found sprint value in dynamicFields.customfield_12740:`,
          sprintValueToAssign,
        );
      }

      logger.error(`Final sprint value to assign:`, sprintValueToAssign);
      logger.error(`Request object keys:`, Object.keys(request));
      logger.error(`Dynamic fields keys:`, Object.keys(dynamicFields));

      if (sprintValueToAssign) {
        logger.error(
          `Attempting post-creation sprint assignment for issue ${createdIssue.key} with sprint value:`,
          sprintValueToAssign,
        );

        try {
          const sprintId = await this.handleSprintCreation(
            {},
            sprintValueToAssign,
          );
          if (sprintId) {
            logger.error(
              `Assigning issue ${createdIssue.key} to sprint ${sprintId} using Agile API`,
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

            logger.error(
              `Making post-creation Agile API call to: ${agileAxios.defaults.baseURL}${agileApiUrl}`,
            );
            logger.error(`Request payload:`, { issues: [createdIssue.key] });

            const response = await agileAxios.post(agileApiUrl, {
              issues: [createdIssue.key],
            });

            logger.error(
              `Post-creation Agile API response:`,
              response.status,
              response.data,
            );
            logger.error(
              `Successfully assigned issue ${createdIssue.key} to sprint ID ${sprintId} after creation`,
            );
          } else {
            logger.error(
              `Could not determine sprint ID for value "${sprintValueToAssign}", skipping sprint assignment`,
            );
          }
        } catch (sprintError) {
          logger.error(
            `Failed to assign sprint after issue creation:`,
            sprintError,
          );
          // Don't fail the entire creation process if sprint assignment fails
          logger.error(
            `Issue ${createdIssue.key} was created successfully but sprint assignment failed`,
          );
        }
      }

      return createdIssue;
    } catch (error) {
      logger.error(`[createIssue] ❌ Error occurred during issue creation`);
      logger.error(
        `[createIssue] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`,
      );

      // Check if this is an axios error with response data
      if (axios.isAxiosError(error)) {
        logger.error(`[createIssue] Axios error detected`);
        logger.error(`[createIssue] HTTP Status: ${error.response?.status}`);
        logger.error(
          `[createIssue] Status Text: ${error.response?.statusText}`,
        );

        // Log the complete error response
        if (error.response?.data) {
          logger.error(`[createIssue] Full error response data:`);
          logger.error(JSON.stringify(error.response.data, null, 2));

          const errors = error.response?.data?.errors;
          const errorMessages = error.response?.data?.errorMessages || [];

          // Log field-specific errors
          if (errors && typeof errors === "object") {
            logger.error(
              `[createIssue] Field-specific errors (${Object.keys(errors).length} fields):`,
            );
            for (const [fieldName, errorMessage] of Object.entries(errors)) {
              logger.error(`  ❌ Field "${fieldName}": ${errorMessage}`);
            }
          }

          // Log general error messages
          if (errorMessages && errorMessages.length > 0) {
            logger.error(
              `[createIssue] General error messages (${errorMessages.length} messages):`,
            );
            for (const errorMessage of errorMessages) {
              logger.error(`  ❌ ${errorMessage}`);
            }
          }
        } else {
          logger.error(`[createIssue] No response data available`);
        }

        // Log request details for debugging
        if (error.config) {
          logger.error(`[createIssue] Request URL: ${error.config.url}`);
          logger.error(`[createIssue] Request method: ${error.config.method}`);
          if (error.config.data) {
            logger.error(`[createIssue] Request data was:`);
            try {
              const requestData =
                typeof error.config.data === "string"
                  ? JSON.parse(error.config.data)
                  : error.config.data;
              logger.error(JSON.stringify(requestData, null, 2));
            } catch (parseError) {
              logger.error(
                `Could not parse request data: ${error.config.data}`,
              );
            }
          }
        }

        // Check if this is an error we can automatically correct
        if (error.response?.data?.errors) {
          const errors = error.response?.data?.errors;
          const errorMessages = error.response?.data?.errorMessages || [];

          // Try to extract field information from error messages
          for (const errorMessage of errorMessages) {
            if (
              typeof errorMessage === "string" &&
              errorMessage.includes("is required")
            ) {
              const fieldMatch = errorMessage.match(
                /([A-Za-z0-9 ]+) is required/,
              );
              if (fieldMatch && fieldMatch[1]) {
                const fieldName = fieldMatch[1].trim();
                logger.error(`Field "${fieldName}" is required but missing`);

                // Try to find the field in the template
                for (const [templateKey, templateValue] of Object.entries(
                  template,
                )) {
                  if (
                    templateKey
                      .toLowerCase()
                      .includes(fieldName.toLowerCase()) ||
                    (typeof templateValue === "object" &&
                      templateValue !== null &&
                      "name" in templateValue &&
                      templateValue.name === fieldName)
                  ) {
                    logger.error(
                      `Found matching template field: ${templateKey}`,
                    );
                    // Use the template value
                    // This would be implemented in a retry mechanism
                  }
                }
              }
            }
          }
        }
      }

      // If we couldn't correct the error, handle it
      logger.error(
        `[createIssue] ⚠️  Unable to automatically correct the error`,
      );
      logger.error(`[createIssue] 📋 Summary of issue creation attempt:`);
      logger.error(`[createIssue]   - Project: ${this.projectKey}`);
      logger.error(
        `[createIssue]   - Issue Type: ${request.type || template.type}`,
      );
      logger.error(`[createIssue]   - Summary: ${request.summary}`);
      if (axios.isAxiosError(error) && error.response?.data?.errors) {
        const errorCount = Object.keys(error.response.data.errors).length;
        logger.error(`[createIssue]   - Number of field errors: ${errorCount}`);
        logger.error(
          `[createIssue]   - Failed fields: ${Object.keys(error.response.data.errors).join(", ")}`,
        );
      }
      logger.error(
        `[createIssue] Calling handleApiError to format error response`,
      );
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Update an existing issue
   * @param request Update issue request
   * @returns Updated issue
   */
  async updateIssue(request: UpdateIssueRequest): Promise<JiraIssue> {
    try {
      // Get the issue first to determine its type
      const issue = await this.getIssue({ issue_key: request.issue_key });
      const issueType = issue.fields.issuetype.name;

      // Find the template for this issue type
      const template =
        this.templates.find(
          (t) => t.type.toLowerCase() === issueType.toLowerCase(),
        ) || this.templates[0];

      const {
        issue_key,
        summary,
        description,
        status,
        assignee,
        reporter,
        ...dynamicFields
      } = request;
      const updateData: any = {
        fields: {},
      };

      // Get field metadata for this issue type to understand the required structure
      const issueTypeId = String(issue.fields.issuetype.id || "");
      const fieldMetadata = await this.getFieldMetadata(issueTypeId);

      // Handle common fields
      if (summary) updateData.fields.summary = summary;
      if (description) updateData.fields.description = description;

      // Process assignee field
      if (assignee) {
        const assigneeMetadata = fieldMetadata["assignee"];
        if (assigneeMetadata) {
          updateData.fields.assignee = this.formatValueBasedOnMetadata(
            "assignee",
            assignee,
            assigneeMetadata,
          );
        } else {
          updateData.fields.assignee = { name: assignee };
        }
      }

      // Process reporter field
      if (reporter) {
        const reporterMetadata = fieldMetadata["reporter"];
        if (reporterMetadata) {
          updateData.fields.reporter = this.formatValueBasedOnMetadata(
            "reporter",
            reporter,
            reporterMetadata,
          );
        } else {
          updateData.fields.reporter = { name: reporter };
        }
      }

      // Handle status change through transitions
      if (status) {
        const transitions = await this.axiosInstance.get(
          `/issue/${issue_key}/transitions`,
        );
        const transition = transitions.data.transitions.find(
          (t: any) => t.name.toLowerCase() === status.toLowerCase(),
        );
        if (
          transition &&
          typeof transition === "object" &&
          "id" in transition
        ) {
          await this.axiosInstance.post(`/issue/${issue_key}/transitions`, {
            transition: { id: transition.id },
          });
        }
      }

      logger.debug(
        "updateissue ==========> fieldMetadata:",
        JSON.stringify(fieldMetadata, null, 2),
      );

      // Process dynamic fields from user input
      for (const [key, value] of Object.entries(dynamicFields)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }

        // Special handling for sprint field
        if (key === "customfield_12740" || key.toLowerCase() === "sprint") {
          await this.handleSprintUpdate(updateData, value, issue_key);
          continue;
        }

        // Special handling for fixVersions field
        if (key === "fixVersions" || key.toLowerCase() === "fixversions") {
          await this.handleFixVersionsUpdate(updateData, value);
          continue;
        }

        // Special handling for versions field
        if (key === "versions") {
          await this.handleVersionsUpdate(updateData, value);
          continue;
        }

        // Try to find the field in metadata by exact name, case-insensitive name, or ID mapping
        let fieldId = key;
        let metadata = fieldMetadata[key];

        // If not found by exact name, try case-insensitive matching
        if (!metadata) {
          metadata = fieldMetadata[key.toLowerCase()];
          if (metadata) {
            fieldId = metadata.id;
          }
        }

        // If still not found, try to map the key to a field ID
        if (!metadata) {
          const mappedId = this.mapFieldNameToId(key);
          if (mappedId !== key) {
            fieldId = mappedId;
            metadata = fieldMetadata[fieldId];
          }
        }

        // Format the value based on metadata if available
        if (metadata) {
          updateData.fields[fieldId] = this.formatValueBasedOnMetadata(
            fieldId,
            value,
            metadata,
          );
          logger.error(
            `Updated field ${key} (${fieldId}) using metadata-based formatting:`,
            updateData.fields[fieldId],
          );
        } else {
          // If no metadata from issue type, try to find field in global field cache
          let globalFieldMetadata = null;

          // Search in all fields cache for this field
          if (this.allFieldsCache.length > 0) {
            const globalField = this.allFieldsCache.find(
              (f: any) =>
                f.id === fieldId ||
                (f.name && f.name.toLowerCase() === key.toLowerCase()) ||
                (f.name && key.toLowerCase().includes(f.name.toLowerCase())) ||
                (f.name && f.name.toLowerCase().includes(key.toLowerCase())),
            );

            if (globalField) {
              globalFieldMetadata = {
                id: globalField.id,
                name: globalField.name,
                schema: globalField.schema,
                custom: globalField.custom || false,
                operations: ["set"], // Assume set operation is available for updates
              };
              fieldId = globalField.id; // Use the correct field ID
              logger.error(
                `Found field ${key} in global cache as ${globalField.name} (${globalField.id})`,
              );
            }
          }

          if (globalFieldMetadata) {
            // Use global field metadata to format the value
            updateData.fields[fieldId] = this.formatValueBasedOnMetadata(
              fieldId,
              value,
              globalFieldMetadata,
            );
            logger.error(
              `Updated field ${key} (${fieldId}) using global field metadata:`,
              updateData.fields[fieldId],
            );
          } else {
            // Try to find a matching field in the template for structure reference
            let templateStructureFound = false;

            for (const [templateKey, templateValue] of Object.entries(
              template,
            )) {
              // Skip common fields
              if (
                [
                  "summary",
                  "description",
                  "type",
                  "issuetype",
                  "assignee",
                ].includes(templateKey)
              ) {
                continue;
              }

              // Check if the template field name contains the dynamic field name or vice versa
              const normalizedKey = key.toLowerCase();
              const normalizedTemplateKey = templateKey.toLowerCase();

              // Match if field names are similar
              if (
                normalizedTemplateKey.includes(normalizedKey) ||
                normalizedKey.includes(normalizedTemplateKey)
              ) {
                const templateFieldId = this.mapFieldNameToId(templateKey);
                const templateMetadata =
                  fieldMetadata[templateFieldId] || fieldMetadata[templateKey];

                if (templateMetadata) {
                  updateData.fields[templateFieldId] =
                    this.formatValueBasedOnMetadata(
                      templateFieldId,
                      value,
                      templateMetadata,
                    );
                  logger.error(
                    `Updated field ${key} using template field ${templateKey} with metadata:`,
                    updateData.fields[templateFieldId],
                  );
                } else {
                  // Use the same structure as the template value
                  if (
                    typeof templateValue === "object" &&
                    templateValue !== null
                  ) {
                    if ("value" in templateValue) {
                      updateData.fields[templateFieldId] = { value };
                    } else if ("name" in templateValue) {
                      updateData.fields[templateFieldId] = { name: value };
                    } else {
                      updateData.fields[templateFieldId] = value;
                    }
                  } else {
                    updateData.fields[templateFieldId] = value;
                  }
                  logger.error(
                    `Updated field ${key} using template field ${templateKey} structure:`,
                    updateData.fields[templateFieldId],
                  );
                }

                templateStructureFound = true;
                break;
              }
            }

            // If no template structure found, use intelligent defaults based on field type
            if (!templateStructureFound) {
              logger.error(
                `No metadata or template found for field ${key} (${fieldId}), using intelligent defaults`,
              );

              // For custom fields, try to determine the best format
              if (fieldId.startsWith("customfield_")) {
                // Check if there's a corresponding field in the template to get its structure
                const templateField = Object.entries(template).find(
                  ([templateKey, _]) => {
                    const templateFieldId = this.mapFieldNameToId(templateKey);
                    return templateFieldId === fieldId;
                  },
                );

                if (
                  templateField &&
                  typeof templateField[1] === "object" &&
                  templateField[1] !== null
                ) {
                  // Use the same structure as in the template
                  const templateValue = templateField[1];

                  // Handle array of objects with value property
                  if (Array.isArray(templateValue)) {
                    // Check if the array contains objects with value property
                    if (
                      templateValue.length > 0 &&
                      typeof templateValue[0] === "object" &&
                      templateValue[0] !== null &&
                      "value" in templateValue[0]
                    ) {
                      // If the value contains commas, it might be a comma-separated list
                      if (typeof value === "string" && value.includes(",")) {
                        updateData.fields[fieldId] = value
                          .split(",")
                          .map((item) => item.trim())
                          .filter((item) => item !== "")
                          .map((item) => ({ value: item }));
                      } else {
                        // Single value
                        updateData.fields[fieldId] = [{ value }];
                      }
                    } else {
                      // Simple array
                      if (typeof value === "string" && value.includes(",")) {
                        updateData.fields[fieldId] = value
                          .split(",")
                          .map((item) => item.trim())
                          .filter((item) => item !== "");
                      } else {
                        updateData.fields[fieldId] = [value];
                      }
                    }
                  }
                  // Handle nested structure like parent-child
                  else if (
                    "value" in templateValue &&
                    "child" in templateValue
                  ) {
                    if (typeof value === "string" && value.includes(" - ")) {
                      const [parentValue, childValue] = value
                        .split(" - ")
                        .map((part) => part.trim());
                      updateData.fields[fieldId] = {
                        value: parentValue,
                        child: { value: childValue },
                      };
                    } else {
                      updateData.fields[fieldId] = {
                        value: value,
                        child: { value: "" },
                      };
                    }
                  } else if ("value" in templateValue) {
                    // Simple value object
                    updateData.fields[fieldId] = { value };
                  } else {
                    // Use default structure
                    updateData.fields[fieldId] = { value };
                  }
                  logger.error(
                    `Updated custom field ${key} (${fieldId}) using template structure:`,
                    updateData.fields[fieldId],
                  );
                } else {
                  // No template structure found, use intelligent defaults for custom fields
                  // Try multiple formats that might work
                  if (typeof value === "string" && value.includes(",")) {
                    // Might be a multi-value field
                    const values = value
                      .split(",")
                      .map((item) => item.trim())
                      .filter((item) => item !== "");
                    updateData.fields[fieldId] = values.map((v) => ({
                      value: v,
                    }));
                    logger.error(
                      `Updated custom field ${key} (${fieldId}) as multi-value:`,
                      updateData.fields[fieldId],
                    );
                  } else {
                    // Single value - try both direct value and object format
                    updateData.fields[fieldId] = { value };
                    logger.error(
                      `Updated custom field ${key} (${fieldId}) as single value object:`,
                      updateData.fields[fieldId],
                    );
                  }
                }
              } else {
                // Standard fields - use direct value
                updateData.fields[fieldId] = value;
                logger.error(
                  `Updated standard field ${key} (${fieldId}) with direct value:`,
                  updateData.fields[fieldId],
                );
              }
            }
          }
        }
      }

      // Update the issue
      await this.axiosInstance.put(`/issue/${issue_key}`, updateData);

      // Get the updated issue
      return await this.getIssue({ issue_key });
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Get an issue by key
   * @param request Get issue request
   * @returns Issue
   */
  async getIssue(request: GetIssueRequest): Promise<JiraIssue> {
    try {
      const response = await this.axiosInstance.get(
        `/issue/${request.issue_key}`,
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Delete an issue
   * @param request Delete issue request
   */
  async deleteIssue(request: DeleteIssueRequest): Promise<void> {
    try {
      await this.axiosInstance.delete(`/issue/${request.issue_key}`);
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Add a comment to an issue
   * @param request Add comment request
   */
  async addComment(request: AddCommentRequest): Promise<void> {
    try {
      await this.axiosInstance.post(`/issue/${request.issue_key}/comment`, {
        body: request.comment,
      });
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Delete a comment from an issue
   * @param issueKey Issue key
   * @param commentId Comment ID to delete
   */
  async deleteComment(issueKey: string, commentId: string): Promise<void> {
    try {
      await this.axiosInstance.delete(
        `/issue/${issueKey}/comment/${commentId}`,
      );
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Get available transitions for an issue
   * @param request Get transitions request
   * @returns Available transitions for the issue
   */
  async getTransitions(request: GetTransitionsRequest): Promise<any> {
    try {
      const response = await this.axiosInstance.get(
        `/issue/${request.issue_key}/transitions`,
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Update transition (change status) for an issue
   * @param request Update transition request
   * @returns Response from the API
   */
  async updateTransition(request: UpdateTransitionRequest): Promise<any> {
    try {
      const body: any = {
        transition: {
          id: request.transition_id,
        },
      };

      // Add comment if provided
      if (request.comment) {
        body.update = {
          comment: [
            {
              add: {
                body: request.comment,
              },
            },
          ],
        };
      }

      const response = await this.axiosInstance.post(
        `/issue/${request.issue_key}/transitions`,
        body,
      );

      return {
        success: true,
        message: `Successfully transitioned issue ${request.issue_key} using transition ID ${request.transition_id}`,
        data: response.data,
      };
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Search issues with advanced filters including sprint support
   * @param request Search issues request
   * @returns List of issues
   */
  async searchIssues(request: SearchIssuesRequest): Promise<JiraIssue[]> {
    try {
      logger.debug(
        `[searchIssues] Called with request: ${JSON.stringify(request)}`,
      );

      let jql = "";

      // Handle project filtering
      if (request.projectKey) {
        // If projectKey is specified, search only in that project
        jql = `project = ${request.projectKey}`;
      } else {
        // If no projectKey is specified, search in all projects (no project filter)
        // This allows searching across all projects the user has access to
        jql = "";
      }

      if (request.status) {
        if (jql) {
          jql += ` AND status = "${request.status}"`;
        } else {
          jql = `status = "${request.status}"`;
        }
      }

      if (request.assignee) {
        if (jql) {
          jql += ` AND assignee = ${request.assignee}`;
        } else {
          jql = `assignee = ${request.assignee}`;
        }
      }

      if (request.sprint) {
        // Handle sprint parameter - can be sprint name or sprint ID
        let sprintCondition = "";
        if (typeof request.sprint === "string") {
          // If it's a string, it could be a sprint name or ID
          if (/^\d+$/.test(request.sprint)) {
            // If it's all digits, treat as sprint ID
            sprintCondition = `Sprint = ${request.sprint}`;
          } else {
            // If it contains non-digits, treat as sprint name
            sprintCondition = `Sprint = "${request.sprint}"`;
          }
        } else {
          // If it's a number, treat as sprint ID
          sprintCondition = `Sprint = ${request.sprint}`;
        }

        if (jql) {
          jql += ` AND ${sprintCondition}`;
        } else {
          jql = sprintCondition;
        }
      }

      // Add additional JQL conditions if provided
      if (request.additionalJql) {
        // Ensure the additional JQL is properly formatted
        const additionalJql = request.additionalJql.trim();
        if (additionalJql) {
          if (jql) {
            // If the additional JQL doesn't start with AND/OR, add AND
            if (
              !additionalJql.toLowerCase().startsWith("and ") &&
              !additionalJql.toLowerCase().startsWith("or ")
            ) {
              jql += ` AND ${additionalJql}`;
            } else {
              jql += ` ${additionalJql}`;
            }
          } else {
            jql = additionalJql;
          }
        }
      }

      // If no conditions were specified, add a basic condition to avoid empty JQL
      if (!jql) {
        jql = "project is not EMPTY";
      }

      jql += " ORDER BY updated DESC";

      logger.info(`[searchIssues] Executing JQL: ${jql}`);
      logger.debug(`[searchIssues] About to call axiosInstance.get("/search")`);

      const response = await this.axiosInstance.get("/search", {
        params: {
          jql,
          maxResults: 50,
        },
      });

      logger.debug(
        `[searchIssues] Got response with status: ${response.status}`,
      );
      logger.info(
        `[searchIssues] Got ${response.data.issues?.length || 0} issues`,
      );
      return response.data.issues;
    } catch (error) {
      logger.error(`[searchIssues] Error occurred:`, error);
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Get user information
   * @param request Get user info request
   * @returns User information
   */
  async getUserInfo(request: GetUserInfoRequest): Promise<JiraUser[]> {
    try {
      const response = await this.axiosInstance.get("/user/search", {
        params: {
          username: request.username,
        },
      });
      return response.data;
    } catch (error) {
      this.handleApiError(error);
      throw error;
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
        this.allFieldsCache = fieldsResponse.data;
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
        // Create a new JiraApiService instance if we need to use a different project
        const apiService = new JiraApiService(
          this.jiraDomain,
          projectKey,
          this.templates,
          this.configService,
          this.authManager,
        );
        await apiService.initialize();
        fieldMetadata = await apiService.getFieldMetadata(issueTypeId);
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
      logger.error(
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
        logger.error("Agile API failed, trying alternative approach:", error);

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
  private async handleSprintCreation(
    fields: any,
    value: any,
  ): Promise<number | null> {
    try {
      logger.error(`Handling sprint creation with value:`, value);

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
        logger.error(
          `Failed to get project sprint values, continuing with direct creation:`,
          error,
        );
      }

      logger.error(
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
          logger.error(
            `Found matching sprint: ${matchingSprint.name} (ID: ${sprintId})`,
          );
        }
      }

      // If no match found but value is numeric, use it as sprint ID
      if (!sprintId && /^\d+$/.test(sprintStr)) {
        sprintId = parseInt(sprintStr);
        logger.error(`Using numeric value as sprint ID: ${sprintId}`);
      }

      if (sprintId) {
        logger.error(
          `Sprint ID ${sprintId} will be assigned after issue creation using Agile API`,
        );
        // Don't set the field during creation - return the sprint ID for post-creation assignment
        return sprintId;
      } else {
        logger.error(
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
  private async handleSprintUpdate(
    updateData: any,
    value: any,
    issueKey: string,
  ): Promise<void> {
    try {
      logger.error(`Handling sprint update for ${issueKey} with value:`, value);

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
        logger.error(
          `Failed to get project sprint values, continuing with direct update:`,
          error,
        );
      }

      logger.error(
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
          logger.error(
            `Found matching sprint: ${matchingSprint.name} (ID: ${sprintId})`,
          );
        }
      }

      // If no match found but value is numeric, use it as sprint ID
      if (!sprintId && /^\d+$/.test(sprintStr)) {
        sprintId = parseInt(sprintStr);
        logger.error(`Using numeric value as sprint ID: ${sprintId}`);
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
                  logger.error(
                    `Extracted sprint ID from complex string for "${sprintStr}": ${sprintId} (name: ${extractedName})`,
                  );
                  break;
                }
              }

              // Also check if the sprint ID matches directly
              if (extractedId.toString() === sprintStr) {
                sprintId = extractedId;
                logger.error(
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

          logger.error(
            `Attempting Agile API call to: ${agileAxios.defaults.baseURL}${agileApiUrl}`,
          );
          logger.error(`Request payload:`, { issues: [issueKey] });

          const response = await agileAxios.post(agileApiUrl, {
            issues: [issueKey],
          });

          logger.error(`Agile API response:`, response.status, response.data);
          logger.error(
            `Successfully moved issue ${issueKey} to sprint ID ${sprintId} using Agile API`,
          );
          agileApiSuccess = true;

          // Don't set the field update since Agile API succeeded
          delete updateData.fields.customfield_12740;
        } catch (agileApiError: any) {
          logger.error(`Agile API failed for sprint ${sprintId}:`, {
            status: agileApiError.response?.status,
            statusText: agileApiError.response?.statusText,
            data: agileApiError.response?.data,
            message: agileApiError.message,
          });
          agileApiSuccess = false;
        }

        // If Agile API failed, try direct field update as fallback
        if (!agileApiSuccess) {
          logger.error(
            `Falling back to direct field update for sprint ${sprintId}`,
          );
          updateData.fields.customfield_12740 = [sprintId];
          logger.error(`Set sprint field to array format: [${sprintId}]`);
        }
      } else {
        // If no numeric ID available, try to use the value directly
        logger.error(
          `No matching sprint found for "${sprintStr}", attempting direct assignment`,
        );

        // Try different formats that Jira might accept
        if (Array.isArray(value)) {
          updateData.fields.customfield_12740 = value;
        } else {
          updateData.fields.customfield_12740 = [sprintStr];
        }
        logger.error(
          `Set sprint field to direct value:`,
          updateData.fields.customfield_12740,
        );
      }
    } catch (error) {
      logger.error(`Error handling sprint update:`, error);
      // Don't throw error, just log it and continue with other field updates
      logger.error(`Sprint update failed, continuing with other field updates`);
    }
  }

  /**
   * Handle fixVersions field update with proper validation and mapping
   * @param updateData Update data object to modify
   * @param value Version value (name or ID)
   */
  private async handleFixVersionsUpdate(
    updateData: any,
    value: string,
  ): Promise<void> {
    try {
      logger.error(`Handling fixVersions update with value: ${value}`);

      // Get available versions for the project
      const versionsResponse = await this.axiosInstance.get(
        `/project/${this.projectKey}/versions`,
      );
      const availableVersions = versionsResponse.data || [];

      // Try to find matching version by name or ID
      let matchingVersion = null;

      // First try exact name match
      matchingVersion = availableVersions.find(
        (version: any) =>
          version.name && version.name.toLowerCase() === value.toLowerCase(),
      );

      // If not found by name, try ID match
      if (!matchingVersion && /^\d+$/.test(value)) {
        matchingVersion = availableVersions.find(
          (version: any) => version.id && version.id.toString() === value,
        );
      }

      // If not found, try partial name match
      if (!matchingVersion) {
        matchingVersion = availableVersions.find(
          (version: any) =>
            version.name &&
            version.name.toLowerCase().includes(value.toLowerCase()),
        );
      }

      if (matchingVersion) {
        // Use the version object for the update
        updateData.fields.fixVersions = [
          { id: matchingVersion.id, name: matchingVersion.name },
        ];
        logger.error(
          `Found matching fixVersion: ${matchingVersion.name} (ID: ${matchingVersion.id})`,
        );
      } else {
        // If no match found, create a new version or use as-is
        logger.error(`No matching fixVersion found for "${value}"`);

        // Try to create the version if it doesn't exist
        try {
          const newVersionResponse = await this.axiosInstance.post(`/version`, {
            name: value,
            project: this.projectKey,
            description: `Auto-created version: ${value}`,
          });

          const newVersion = newVersionResponse.data;
          updateData.fields.fixVersions = [
            { id: newVersion.id, name: newVersion.name },
          ];
          logger.error(
            `Created new fixVersion: ${newVersion.name} (ID: ${newVersion.id})`,
          );
        } catch (createError) {
          logger.error(`Failed to create new version "${value}":`, createError);
          throw new Error(
            `Version "${value}" not found in project ${this.projectKey} and could not be created. Available versions: ${availableVersions.map((v: any) => v.name).join(", ")}`,
          );
        }
      }
    } catch (error) {
      logger.error(`Error handling fixVersions update:`, error);
      throw error;
    }
  }

  /**
   * Handle versions field update with proper validation and mapping
   * @param updateData Update data object to modify
   * @param value Version value (name or ID)
   */
  private async handleVersionsUpdate(
    updateData: any,
    value: string,
  ): Promise<void> {
    try {
      logger.error(`Handling versions update with value: ${value}`);

      // Get available versions for the project
      const versionsResponse = await this.axiosInstance.get(
        `/project/${this.projectKey}/versions`,
      );
      const availableVersions = versionsResponse.data || [];

      // Try to find matching version by name or ID
      let matchingVersion = null;

      // First try exact name match
      matchingVersion = availableVersions.find(
        (version: any) =>
          version.name && version.name.toLowerCase() === value.toLowerCase(),
      );

      // If not found by name, try ID match
      if (!matchingVersion && /^\d+$/.test(value)) {
        matchingVersion = availableVersions.find(
          (version: any) => version.id && version.id.toString() === value,
        );
      }

      // If not found, try partial name match
      if (!matchingVersion) {
        matchingVersion = availableVersions.find(
          (version: any) =>
            version.name &&
            version.name.toLowerCase().includes(value.toLowerCase()),
        );
      }

      if (matchingVersion) {
        // Use the version object for the update
        updateData.fields.versions = [
          { id: matchingVersion.id, name: matchingVersion.name },
        ];
        logger.error(
          `Found matching version: ${matchingVersion.name} (ID: ${matchingVersion.id})`,
        );
      } else {
        // If no match found, create a new version or use as-is
        logger.error(`No matching version found for "${value}"`);

        // Try to create the version if it doesn't exist
        try {
          const newVersionResponse = await this.axiosInstance.post(`/version`, {
            name: value,
            project: this.projectKey,
            description: `Auto-created version: ${value}`,
          });

          const newVersion = newVersionResponse.data;
          updateData.fields.versions = [
            { id: newVersion.id, name: newVersion.name },
          ];
          logger.error(
            `Created new version: ${newVersion.name} (ID: ${newVersion.id})`,
          );
        } catch (createError) {
          logger.error(`Failed to create new version "${value}":`, createError);
          throw new Error(
            `Version "${value}" not found in project ${this.projectKey} and could not be created. Available versions: ${availableVersions.map((v: any) => v.name).join(", ")}`,
          );
        }
      }
    } catch (error) {
      logger.error(`Error handling versions update:`, error);
      throw error;
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
      logger.error(
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

      logger.error(
        `Making Agile API call to: ${agileAxios.defaults.baseURL}${agileApiUrl}`,
      );
      logger.error(`Request payload:`, { issues: [issueKey] });

      const response = await agileAxios.post(agileApiUrl, {
        issues: [issueKey],
      });

      logger.error(`Agile API response:`, response.status, response.data);
      logger.error(
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
      logger.error(`Agile API failed for sprint ${sprintId}:`, {
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

  /**
   * Handle API errors with improved axios 1.10.0 error handling
   * @param error Error object
   */
  private handleApiError(error: any): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;

      // Enhanced error information extraction
      const errorCode = error.code;
      const errorMessage =
        data?.errorMessages?.[0] || error.message || "Unknown error";

      // Handle authentication errors for cookie-based auth
      if (this.authManager.getAuthType() === "cookies") {
        // Handle authentication errors (401 Unauthorized or redirects)
        // Redirects (302, 307, 308) often indicate session expired and redirect to login
        if (
          status === 401 ||
          status === 403 ||
          status === 302 ||
          status === 307 ||
          status === 308
        ) {
          const authError: any = {
            error: "SAP_AUTH_REQUIRED",
            details:
              "Need call SAP auth MCP to prepare cookie and redo function after.",
            data: {
              store_path: this.authManager.getCookieDir(),
              entry_url: this.BASE_URL,
            },
          };

          throw new McpError(
            ErrorCode.InvalidRequest,
            JSON.stringify(authError),
          );
        }

        // Handle session expired or invalid cookies (often returns as redirect or specific error pages)
        // Check if response data indicates authentication issues
        if (
          typeof data === "string" &&
          (data.includes("login") ||
            data.includes("authentication") ||
            data.includes("microsoftonline.com") ||
            data.includes("Sign in to your account"))
        ) {
          const authError: any = {
            error: "SAP_AUTH_REQUIRED",
            details:
              "Need call SAP auth MCP to prepare cookie and redo function after.",
            data: {
              store_path: this.authManager.getCookieDir(),
              entry_url: this.BASE_URL,
            },
          };

          throw new McpError(
            ErrorCode.InvalidRequest,
            JSON.stringify(authError),
          );
        }
      }

      switch (status) {
        case 401:
          throw new McpError(
            ErrorCode.InvalidRequest,
            this.authManager.getAuthType() === "cookies"
              ? "Unauthorized: Cookie authentication failed"
              : "Unauthorized: Invalid API token",
          );
        case 403:
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Permission denied: You don't have permission to perform this action",
          );
        case 404:
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Not found: The requested resource does not exist",
          );
        case 400:
          // Log detailed 400 error information for debugging
          logger.error(`[handleApiError] 400 Bad Request Error Details:`);
          logger.error(
            `[handleApiError] Full response data:`,
            JSON.stringify(data, null, 2),
          );

          if (data?.errors) {
            logger.error(`[handleApiError] Field errors:`);
            
            // Build enhanced error message with both field names and IDs
            const enhancedErrors: string[] = [];
            
            for (const [fieldKey, errorMessage] of Object.entries(data.errors)) {
              logger.error(`  - ${fieldKey}: ${errorMessage}`);
              
              // Get the field name from our mapping cache
              const fieldName = this.fieldIdToNameMap[fieldKey] || fieldKey;
              const fieldId = this.fieldNameToIdMap[fieldName] || fieldKey;
              
              // Create enhanced error message showing both name and ID
              let enhancedError = '';
              if (fieldKey.startsWith('customfield_')) {
                // If the key is a customfield ID, show both name and ID
                enhancedError = `"${fieldName}" (${fieldKey}): ${errorMessage}`;
              } else if (fieldId.startsWith('customfield_')) {
                // If the key is a field name but has a customfield ID, show both
                enhancedError = `"${fieldKey}" (${fieldId}): ${errorMessage}`;
              } else {
                // Standard field, just show the field name
                enhancedError = `"${fieldKey}": ${errorMessage}`;
              }
              
              // Try to get allowed values for this field to help the user
              try {
                const fieldMetadata = this.fieldMetadataCache;
                let fieldInfo = null;
                
                // Search through all cached metadata for this field
                for (const issueTypeId in fieldMetadata) {
                  const metadata = fieldMetadata[issueTypeId];
                  if (metadata[fieldKey] || metadata[fieldName]) {
                    fieldInfo = metadata[fieldKey] || metadata[fieldName];
                    break;
                  }
                }
                
                // If we found field metadata with allowed values, include them in the error
                if (fieldInfo && fieldInfo.allowedValues && Array.isArray(fieldInfo.allowedValues)) {
                  const allowedValues = fieldInfo.allowedValues.slice(0, 10); // Limit to first 10 values
                  const valuesList = allowedValues.map((v: any) => {
                    if (typeof v === 'object' && v !== null) {
                      if (v.value) return `"${v.value}"`;
                      if (v.name) return `"${v.name}"`;
                      if (v.id) return `"${v.id}"`;
                    }
                    return `"${v}"`;
                  }).join(', ');
                  
                  const moreValues = fieldInfo.allowedValues.length > 10 
                    ? ` (and ${fieldInfo.allowedValues.length - 10} more)` 
                    : '';
                  
                  enhancedError += `\n  Allowed values: ${valuesList}${moreValues}`;
                  
                  // Add schema information if available
                  if (fieldInfo.schema) {
                    const schemaType = fieldInfo.schema.type;
                    const schemaItems = fieldInfo.schema.items;
                    if (schemaType === 'array' && schemaItems) {
                      enhancedError += `\n  Expected format: array of ${schemaItems} (e.g., [{"value": "..."}])`;
                    }
                  }
                } else if (fieldInfo && fieldInfo.schema) {
                  // If no allowed values but we have schema info, show format hint
                  const schemaType = fieldInfo.schema.type;
                  const schemaItems = fieldInfo.schema.items;
                  if (schemaType === 'array' && schemaItems) {
                    enhancedError += `\n  Expected format: array of ${schemaItems}`;
                    if (schemaItems === 'option') {
                      enhancedError += ` (e.g., [{"value": "..."}])`;
                    } else if (schemaItems === 'string') {
                      enhancedError += ` (e.g., ["value1", "value2"])`;
                    }
                  } else if (schemaType === 'option') {
                    enhancedError += `\n  Expected format: {"value": "..."}`;
                  }
                }
              } catch (metadataError) {
                // If we can't get metadata, just continue with the basic error
                logger.error(`Could not fetch metadata for field ${fieldKey}:`, metadataError);
              }
              
              enhancedErrors.push(enhancedError);
            }
            
            // Throw error with enhanced field information
            const badRequestMessage = enhancedErrors.length > 0
              ? enhancedErrors.join('\n\n')
              : (data?.errorMessages?.[0] || JSON.stringify(data?.errors) || "Bad request");
              
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Bad request:\n${badRequestMessage}`,
            );
          }

          if (data?.errorMessages) {
            logger.error(`[handleApiError] Error messages:`);
            for (const msg of data.errorMessages) {
              logger.error(`  - ${msg}`);
            }
          }

          const badRequestMessage =
            data?.errorMessages?.[0] ||
            JSON.stringify(data?.errors) ||
            "Bad request";
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Bad request: ${badRequestMessage}`,
          );
        default:
          // Handle network and timeout errors with axios 1.10.0 error codes
          if (errorCode === "ECONNABORTED" || errorCode === "ETIMEDOUT") {
            throw new McpError(
              ErrorCode.InternalError,
              `Request timeout: ${errorMessage}`,
            );
          } else if (errorCode === "ERR_NETWORK") {
            throw new McpError(
              ErrorCode.InternalError,
              `Network error: ${errorMessage}`,
            );
          } else if (errorCode === "ERR_CANCELED") {
            throw new McpError(
              ErrorCode.InternalError,
              `Request canceled: ${errorMessage}`,
            );
          } else {
            throw new McpError(
              ErrorCode.InternalError,
              `Jira API error: ${errorMessage}`,
            );
          }
      }
    } else {
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error),
      );
    }
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
    try {
      // Fetch metadata from various Jira endpoints in parallel
      const [
        projectsRes,
        fieldsRes,
        statusesRes,
        prioritiesRes,
        issueTypesRes,
        userRes,
      ] = await Promise.all([
        this.axiosInstance.get("/rest/api/2/project"),
        this.axiosInstance.get("/rest/api/2/field"),
        this.axiosInstance.get("/rest/api/2/status"),
        this.axiosInstance.get("/rest/api/2/priority"),
        this.axiosInstance.get("/rest/api/2/issuetype"),
        this.axiosInstance.get("/rest/api/2/myself"),
      ]);

      // Extract and process metadata
      const allProjects = projectsRes.data || [];
      const topProjects = allProjects
        .filter((p: any) => !p.archived)
        .slice(0, 10)
        .map((p: any) => p.key);

      const allFields = fieldsRes.data || [];
      const customFields = allFields
        .filter((f: any) => f.custom && f.searchable)
        .slice(0, 5)
        .map((f: any) => ({ id: f.id, name: f.name }));

      const allStatuses = statusesRes.data || [];
      const commonStatuses = [
        ...new Set(allStatuses.map((s: any) => s.name)),
      ].slice(0, 8) as string[];

      const allPriorities = prioritiesRes.data || [];
      const priorities = allPriorities.map((p: any) => p.name) as string[];

      const allIssueTypes = issueTypesRes.data || [];
      const issueTypes = allIssueTypes
        .filter((t: any) => !t.subtask)
        .slice(0, 6)
        .map((t: any) => t.name);

      const currentUser = userRes.data?.displayName || "currentUser()";

      // Generate dynamic JQL examples using the fetched metadata
      const examples = [
        {
          title: "Recent tickets assigned to me",
          jql: "assignee = currentUser() ORDER BY updated DESC",
          description: `Find all tickets assigned to ${currentUser}, sorted by most recently updated`,
        },
        {
          title: "Open issues in top SAP projects",
          jql: `project IN (${topProjects.slice(0, 3).join(", ")}) AND status IN (Open, "In Progress") ORDER BY priority DESC`,
          description: `Find open issues in major SAP projects: ${topProjects.slice(0, 3).join(", ")}`,
        },
        {
          title: "High priority tickets created recently",
          jql: `priority = ${priorities[0] || "High"} AND created >= -7d ORDER BY created DESC`,
          description: `Find high priority tickets created in the last 7 days`,
        },
        {
          title: "Production patches and bugs",
          jql: `type IN ("Production Patch", "Bug") AND status NOT IN (Closed, Resolved) ORDER BY updated DESC`,
          description: `Find active production patches and bugs that need attention`,
        },
        {
          title: "My team's work in specific project",
          jql: `project = ${topProjects[0] || "PTCH"} AND assignee IN (currentUser(), membersOf("your-team")) ORDER BY priority DESC, updated DESC`,
          description: `Find tickets in ${topProjects[0] || "PTCH"} project assigned to me or my team members`,
        },
      ];

      return {
        examples: examples.slice(0, 5),
        metadata: {
          topProjects: topProjects.slice(0, 10),
          commonStatuses: commonStatuses.slice(0, 8),
          priorities: priorities,
          issueTypes: issueTypes.slice(0, 6),
          customFields: customFields.slice(0, 5),
          currentUser,
        },
      };
    } catch (error: any) {
      // Fallback to static examples from jql_examples.md if metadata fetch fails
      logger.error("Failed to fetch dynamic metadata, using fallback:", error);
      return {
        examples: [
          {
            title: "Recent tickets assigned to me",
            jql: "assignee = currentUser() ORDER BY updated DESC",
            description:
              "Find all tickets assigned to you, sorted by most recently updated",
          },
          {
            title: "Open issues in PTCH project",
            jql: 'project = PTCH AND status IN (Open, "In Progress") ORDER BY priority DESC',
            description: "Find open issues in PTCH project, sorted by priority",
          },
          {
            title: "High priority tickets created recently",
            jql: "priority = High AND created >= -7d ORDER BY created DESC",
            description:
              "Find high priority tickets created in the last 7 days",
          },
          {
            title: "Production patches needing attention",
            jql: 'type = "Production Patch" AND status NOT IN (Closed, Resolved) ORDER BY updated DESC',
            description: "Find active production patches that need attention",
          },
          {
            title: "Tickets updated in the last 30 days",
            jql: "updated >= -30d AND assignee = currentUser() ORDER BY updated DESC",
            description:
              "Find your tickets that have been updated in the last 30 days",
          },
        ],
        metadata: {
          topProjects: [
            "PTCH",
            "EAS",
            "WSM",
            "COM",
            "CPDNASECURITY",
            "WFSTIME",
          ],
          commonStatuses: [
            "Open",
            "In Progress",
            "Closed",
            "Resolved",
            "To Do",
            "Done",
          ],
          priorities: ["Very High", "High", "Medium", "Low"],
          issueTypes: [
            "Bug",
            "Production Patch",
            "Story",
            "Task",
            "Epic",
            "User Story",
          ],
          customFields: [],
          currentUser: "currentUser()",
        },
      };
    }
  }
}
