/**
 * Base Jira API class with shared infrastructure
 * Contains axios instance, auth interceptor, common helpers, and error handling
 */
import axios, { AxiosInstance } from "axios";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ConfigService } from "../config-service.js";
import { AuthManager } from "../auth-manager.js";
import { buildUserAgent, buildSecChPlatform } from "sap-auth";
import { extractErrorMessage } from "mcp-utils";
import { JiraTemplate } from "../../types.js";
import { logger } from "../../utils/logger.js";

// ============================================================================
// Constants
// ============================================================================
const TIMEOUT_MS = 30000;
const MAX_ALLOWED_VALUES_DISPLAY = 10;

// ============================================================================
// Type Definitions for Jira API
// ============================================================================

/**
 * Schema information for a Jira field
 */
interface JiraFieldSchema {
  type?: string;
  items?: string;
  system?: string;
  custom?: string;
  customId?: number;
}

/**
 * Allowed value option in field metadata
 */
interface JiraAllowedValue {
  id?: string;
  value?: string;
  name?: string;
}

/**
 * Metadata for a Jira field including schema and allowed values
 */
interface JiraFieldMetadataEntry {
  fieldId?: string;
  name?: string;
  required?: boolean;
  schema?: JiraFieldSchema;
  allowedValues?: JiraAllowedValue[];
  [key: string]: unknown;
}

/**
 * Cache structure for field metadata by issue type
 */
type FieldMetadataCache = Record<string, Record<string, JiraFieldMetadataEntry>>;

/**
 * Jira field definition from the fields API
 */
interface JiraFieldDefinition {
  id: string;
  name: string;
  custom?: boolean;
  customId?: number | null;
  schema?: JiraFieldSchema;
}

/**
 * SAP authentication error structure
 */
interface SapAuthError {
  error: string;
  details: string;
  data: {
    store_path: string;
    entry_url: string;
  };
}

/**
 * Base Jira API class providing shared infrastructure for all API modules
 */
export class BaseJiraApi {
  protected axiosInstance: AxiosInstance;
  protected projectKey: string;
  protected templates: JiraTemplate[];
  protected configService: ConfigService;
  protected fieldMetadataCache: FieldMetadataCache = {};
  protected allFieldsCache: JiraFieldDefinition[] = [];
  protected fieldNameToIdMap: Record<string, string> = {};
  protected fieldIdToNameMap: Record<string, string> = {};
  protected authManager: AuthManager;
  protected readonly jiraDomain: string;
  protected readonly BASE_URL: string;

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

    // Raw client without auth string injected
    this.axiosInstance = axios.create({
      baseURL: `${this.BASE_URL}/rest/api/2`,
      timeout: TIMEOUT_MS,
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
        "sec-ch-ua-platform": buildSecChPlatform(),
        "user-agent": buildUserAgent(),
      },
    });

    // Always register request interceptor for auth handling
    logger.info("[initializeApiClient] Registering request interceptor");
    this.axiosInstance.interceptors.request.use(async (config) => {
      logger.debug(
        `[Interceptor] Request to ${config.method?.toUpperCase()} ${config.url}`,
      );

      // Get auth headers from the auth manager (handles both cookie and API token auth)
      try {
        const authHeaders = await this.authManager.getAuthHeaders();

        // Only set auth headers if not already present
        if (authHeaders.Cookie && !config.headers["Cookie"]) {
          config.headers["Cookie"] = authHeaders.Cookie;
          logger.debug("[Interceptor] Set Cookie header from auth manager");
        } else if (authHeaders.Authorization && !config.headers["Authorization"]) {
          config.headers["Authorization"] = authHeaders.Authorization;
          logger.debug("[Interceptor] Set Authorization header from auth manager");
        }
      } catch (error) {
        logger.warn("[Interceptor] Failed to get auth headers:", error);
        throw error;
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
            `[Response Interceptor] Auth error ${error.response.status}, clearing cached auth`,
          );
          // Clear auth from default headers and auth manager
          delete this.axiosInstance.defaults.headers.common["Cookie"];
          delete this.axiosInstance.defaults.headers.common["Authorization"];
          try {
            await this.authManager.clearAuth();
          } catch (e) {
            logger.debug("[Response Interceptor] Failed to clear auth:", e);
          }
          logger.debug(
            "[Response Interceptor] Auth cleared from default headers due to auth issue",
          );
        }
        return Promise.reject(error);
      },
    );

    logger.debug("[initializeApiClient] Registering request interceptor DONE!");
  }

  /**
   * Initialize the API client
   */
  protected async initializeApiClient(): Promise<void> {
    logger.info("[initializeApiClient] Initializing API client");

    // Get auth headers from the auth manager
    try {
      const authHeaders = await this.authManager.getAuthHeaders();
      const authType = this.authManager.getAuthType();

      if (authType === "cookies") {
        logger.info("[initializeApiClient] Using cookie-based authentication");
        if (authHeaders.Cookie) {
          this.axiosInstance.defaults.headers.common["Cookie"] = authHeaders.Cookie;
          logger.info("Loaded cookies into default headers");
        } else {
          logger.info("No cookies found initially - will load on first request");
        }
      } else {
        // API token-based authentication
        logger.info("[initializeApiClient] Using API token authentication");
        if (authHeaders.Authorization) {
          this.axiosInstance.defaults.headers.common["Authorization"] = authHeaders.Authorization;
          logger.info("API Token injected into default headers");
        }
      }

      logger.info("[initializeApiClient] Auth initialization completed");
    } catch (error) {
      logger.warn("[initializeApiClient] Failed to initialize auth headers:", error);
      logger.info("Auth headers will be loaded on first request via interceptor");
    }
  }

  /**
   * Get the axios instance for making API calls
   */
  public getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  /**
   * Get the base URL
   */
  public getBaseUrl(): string {
    return this.BASE_URL;
  }

  /**
   * Get the project key
   */
  public getProjectKey(): string {
    return this.projectKey;
  }

  /**
   * Get templates
   */
  public getTemplates(): JiraTemplate[] {
    return this.templates;
  }

  /**
   * Get config service
   */
  public getConfigService(): ConfigService {
    return this.configService;
  }

  /**
   * Get auth manager
   */
  public getAuthManager(): AuthManager {
    return this.authManager;
  }

  /**
   * Get field name to ID map
   */
  public getFieldNameToIdMap(): Record<string, string> {
    return this.fieldNameToIdMap;
  }

  /**
   * Get field ID to name map
   */
  public getFieldIdToNameMap(): Record<string, string> {
    return this.fieldIdToNameMap;
  }

  /**
   * Get field metadata cache
   */
  public getFieldMetadataCache(): FieldMetadataCache {
    return this.fieldMetadataCache;
  }

  /**
   * Get all fields cache
   */
  public getAllFieldsCache(): JiraFieldDefinition[] {
    return this.allFieldsCache;
  }

  /**
   * Set field name to ID map entry
   */
  public setFieldNameToIdMap(name: string, id: string): void {
    this.fieldNameToIdMap[name] = id;
  }

  /**
   * Set field ID to name map entry
   */
  public setFieldIdToNameMap(id: string, name: string): void {
    this.fieldIdToNameMap[id] = name;
  }

  /**
   * Set field metadata cache entry
   */
  public setFieldMetadataCache(key: string, value: Record<string, JiraFieldMetadataEntry>): void {
    this.fieldMetadataCache[key] = value;
  }

  /**
   * Set all fields cache
   */
  public setAllFieldsCache(cache: JiraFieldDefinition[]): void {
    this.allFieldsCache = cache;
  }

  /**
   * Map a field name to its Jira field ID using dynamic metadata
   * @param fieldName Field name (human-readable or Jira field ID)
   * @returns Jira field ID
   */
  public mapFieldNameToId(fieldName: string): string {
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
   * Handle API errors with improved axios 1.10.0 error handling
   * @param error Error object
   */
  public handleApiError(error: unknown): never {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as Record<string, unknown> | string | undefined;

      // Enhanced error information extraction
      const errorCode = error.code;
      const dataObj = typeof data === "object" && data !== null ? data : {};
      const errorMessages = dataObj.errorMessages as string[] | undefined;
      const errorMessage = errorMessages?.[0] || error.message || "Unknown error";

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
          const authError: SapAuthError = {
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
          const authError: SapAuthError = {
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

          // Extract errors from the data object
          const errors = dataObj.errors as Record<string, string> | undefined;

          if (errors) {
            logger.error(`[handleApiError] Field errors:`);

            // Build enhanced error message with both field names and IDs
            const enhancedErrors: string[] = [];

            for (const [fieldKey, fieldErrorMessage] of Object.entries(errors)) {
              logger.error(`  - ${fieldKey}: ${fieldErrorMessage}`);

              // Get the field name from our mapping cache
              const fieldName = this.fieldIdToNameMap[fieldKey] || fieldKey;
              const fieldId = this.fieldNameToIdMap[fieldName] || fieldKey;

              // Create enhanced error message showing both name and ID
              let enhancedError = '';
              if (fieldKey.startsWith('customfield_')) {
                // If the key is a customfield ID, show both name and ID
                enhancedError = `"${fieldName}" (${fieldKey}): ${fieldErrorMessage}`;
              } else if (fieldId.startsWith('customfield_')) {
                // If the key is a field name but has a customfield ID, show both
                enhancedError = `"${fieldKey}" (${fieldId}): ${fieldErrorMessage}`;
              } else {
                // Standard field, just show the field name
                enhancedError = `"${fieldKey}": ${fieldErrorMessage}`;
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
                  const allowedValues = fieldInfo.allowedValues.slice(0, MAX_ALLOWED_VALUES_DISPLAY);
                  const valuesList = allowedValues.map((v: JiraAllowedValue) => {
                    if (typeof v === 'object' && v !== null) {
                      if (v.value) return `"${v.value}"`;
                      if (v.name) return `"${v.name}"`;
                      if (v.id) return `"${v.id}"`;
                    }
                    return `"${v}"`;
                  }).join(', ');

                  const moreValues = fieldInfo.allowedValues.length > MAX_ALLOWED_VALUES_DISPLAY
                    ? ` (and ${fieldInfo.allowedValues.length - MAX_ALLOWED_VALUES_DISPLAY} more)`
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
              : (errorMessages?.[0] || JSON.stringify(errors) || "Bad request");

            throw new McpError(
              ErrorCode.InvalidRequest,
              `Bad request:\n${badRequestMessage}`,
            );
          }

          if (errorMessages) {
            logger.error(`[handleApiError] Error messages:`);
            for (const msg of errorMessages) {
              logger.error(`  - ${msg}`);
            }
          }

          {
            const badRequestMessage =
              errorMessages?.[0] ||
              JSON.stringify(errors) ||
              "Bad request";
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Bad request: ${badRequestMessage}`,
            );
          }
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
        extractErrorMessage(error),
      );
    }
  }
}
