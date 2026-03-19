/**
 * Issue API module for Jira
 * Handles Issue CRUD operations
 */
import axios from "axios";
import {
  JiraIssue,
  CreateIssueRequest,
  UpdateIssueRequest,
  SearchIssuesRequest,
  GetIssueRequest,
  DeleteIssueRequest,
  JiraTemplate,
} from "../../types.js";
import { BaseJiraApi } from "./base.js";
import { FieldApi } from "./field-api.js";
import { UserApi } from "./user-api.js";
import { SprintApi } from "./sprint-api.js";
import { logger } from "../../utils/logger.js";

/**
 * Issue API class for managing Jira issues
 */
export class IssueApi extends BaseJiraApi {
  private fieldApi!: FieldApi;
  private userApi!: UserApi;
  private sprintApi!: SprintApi;

  /**
   * Set the field API reference
   */
  setFieldApi(fieldApi: FieldApi): void {
    this.fieldApi = fieldApi;
  }

  /**
   * Set the user API reference
   */
  setUserApi(userApi: UserApi): void {
    this.userApi = userApi;
  }

  /**
   * Set the sprint API reference
   */
  setSprintApi(sprintApi: SprintApi): void {
    this.sprintApi = sprintApi;
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
          const currentUser = await this.userApi.getCurrentUser();
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
        logger.debug(`Found sprint in request:`, sprintValueFromRequest);
      } else if (request.customfield_12740) {
        sprintValueFromRequest = request.customfield_12740;
        logger.debug(
          `Found customfield_12740 in request:`,
          sprintValueFromRequest,
        );
      } else if (dynamicFields.sprint) {
        sprintValueFromRequest = dynamicFields.sprint;
        logger.debug(`Found sprint in dynamicFields:`, sprintValueFromRequest);
      } else if (dynamicFields.customfield_12740) {
        sprintValueFromRequest = dynamicFields.customfield_12740;
        logger.debug(
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
        issueTypeId = await this.fieldApi.getIssueTypeId(type);
      }

      // Get field metadata for this issue type to understand the required structure
      const fieldMetadata = await this.fieldApi.getFieldMetadata(issueTypeId);

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
          fields.assignee = this.fieldApi.formatValueBasedOnMetadata(
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
        }
      }

      // Process reporter field
      if (reporter) {
        const reporterMetadata = fieldMetadata["reporter"];
        if (reporterMetadata) {
          fields.reporter = this.fieldApi.formatValueBasedOnMetadata(
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
        }
      }

      // Intercept parent field from dynamicFields and format for Jira API
      if (dynamicFields.parent) {
        const parentValue = dynamicFields.parent;
        if (typeof parentValue === "object" && parentValue !== null && "key" in parentValue) {
          // Already in correct format: { key: "PROJ-123" }
          fields.parent = parentValue;
        } else if (typeof parentValue === "string") {
          if (/^[A-Z]+-\d+$/i.test(parentValue)) {
            // Looks like a full issue key: "PROJ-123"
            fields.parent = { key: parentValue };
          } else if (/^\d+$/.test(parentValue)) {
            // Bare number: "123" → prefix with project key
            fields.parent = { key: `${this.projectKey}-${parentValue}` };
          } else {
            // Fallback: treat as issue key
            fields.parent = { key: parentValue };
          }
        }
        logger.info(`Processed parent field:`, fields.parent);
        delete dynamicFields.parent;
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

        // Skip fields that don't have metadata
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
          fields[fieldId] = this.fieldApi.formatValueBasedOnMetadata(
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
          fields[fieldId] = this.fieldApi.formatValueBasedOnMetadata(
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

        // Try to find the field in metadata
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

        logger.debug(
          `Processing user field "${key}" with ID "${fieldId}", metadata found: ${!!metadata}`,
        );

        // Skip fields that don't have metadata
        if (!metadata) {
          logger.debug(
            `Skipping user field ${key} (mapped to ${fieldId}) as it has no metadata and might not be available on the appropriate screen`,
          );
          continue;
        }

        // Special handling for labels field
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
          fields[fieldId] = this.fieldApi.formatValueBasedOnMetadata(
            fieldId,
            labelsArray,
            metadata,
          );
          logger.info(
            `Added user field ${key} (mapped to ${fieldId}) with mcp-jira label included:`,
            fields[fieldId],
          );
        } else {
          // Format the value based on metadata
          fields[fieldId] = this.fieldApi.formatValueBasedOnMetadata(
            fieldId,
            value,
            metadata,
          );
          logger.info(
            `Added user field ${key} (mapped to ${fieldId}) with formatted value:`,
            fields[fieldId],
          );
        }
      }

      // Special handling for Epic Name field if this is an Epic
      if (type.toLowerCase() === "epic") {
        const epicNameFieldId = this.fieldApi.findEpicNameFieldId(fieldMetadata);
        if (epicNameFieldId) {
          const epicName = dynamicFields["Epic Name"] || summary;
          if (epicName) {
            fields[epicNameFieldId] = epicName;
            logger.info(
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
        fields[labelsFieldId] = this.fieldApi.formatValueBasedOnMetadata(
          labelsFieldId,
          ["mcp-jira"],
          labelsMetadata,
        );
        logger.info(
          `Added default mcp-jira label to labels field:`,
          fields[labelsFieldId],
        );
      }

      // Check for required fields based on field metadata
      const processedFieldIds = new Set<string>();

      for (const [key, metadata] of Object.entries(fieldMetadata)) {
        // Only process entries where the key is the actual fieldId
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
          logger.debug(
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
                logger.debug(
                  `Found value for ${fieldId} in template: ${fieldValue}`,
                );
                break;
              } else if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ) {
                fieldValue = value;
                logger.debug(
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
                      logger.debug(
                        `Found value for ${fieldId} in other template: ${fieldValue}`,
                      );
                      break;
                    } else if (
                      typeof value === "string" ||
                      typeof value === "number" ||
                      typeof value === "boolean"
                    ) {
                      fieldValue = value;
                      logger.debug(
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
                  logger.debug(
                    `Using first allowed value for ${fieldId}: ${fieldValue}`,
                  );
                } else if ("name" in firstAllowedValue) {
                  fieldValue = firstAllowedValue.name;
                  logger.debug(
                    `Using first allowed value for ${fieldId}: ${fieldValue}`,
                  );
                } else if ("id" in firstAllowedValue) {
                  fieldValue = firstAllowedValue.id;
                  logger.debug(
                    `Using first allowed value for ${fieldId}: ${fieldValue}`,
                  );
                }
              }
            }
          }

          // If we found a value, add it to the fields
          if (fieldValue !== null) {
            fields[fieldId] = this.fieldApi.formatValueBasedOnMetadata(
              fieldId,
              fieldValue,
              metadata,
            );
            logger.info(
              `Added required field ${fieldId} with dynamically determined value:`,
              fields[fieldId],
            );
          } else {
            logger.warn(
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
          logger.debug(`Removing field ${key} with empty string value`);
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
          logger.debug(
            `Removing problematic field '${fieldName}' that may not be on the appropriate screen`,
          );
          delete fields[fieldName];
        }
      }

      // Remove stack field if present
      if (fields.stack) {
        logger.debug("Removing 'stack' field from request");
        delete fields.stack;
      }
      if (fields.Stack) {
        logger.debug("Removing 'Stack' field from request");
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
      logger.debug("[createIssue] Complete request payload:");
      logger.debug(JSON.stringify(requestPayload, null, 2));
      logger.debug(
        `[createIssue] Number of fields in request: ${Object.keys(fields).length}`,
      );
      logger.debug(
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
        logger.debug(
          `Found sprint value in _sprintValue:`,
          sprintValueToAssign,
        );
      } else if (request.sprint) {
        sprintValueToAssign = request.sprint;
        logger.debug(
          `Found sprint value in request.sprint:`,
          sprintValueToAssign,
        );
      } else if (request.customfield_12740) {
        sprintValueToAssign = request.customfield_12740;
        logger.debug(
          `Found sprint value in request.customfield_12740:`,
          sprintValueToAssign,
        );
      } else if (dynamicFields.sprint) {
        sprintValueToAssign = dynamicFields.sprint;
        logger.debug(
          `Found sprint value in dynamicFields.sprint:`,
          sprintValueToAssign,
        );
      } else if (dynamicFields.customfield_12740) {
        sprintValueToAssign = dynamicFields.customfield_12740;
        logger.debug(
          `Found sprint value in dynamicFields.customfield_12740:`,
          sprintValueToAssign,
        );
      }

      logger.debug(`Final sprint value to assign:`, sprintValueToAssign);
      logger.debug(`Request object keys:`, Object.keys(request));
      logger.debug(`Dynamic fields keys:`, Object.keys(dynamicFields));

      if (sprintValueToAssign) {
        logger.debug(
          `Attempting post-creation sprint assignment for issue ${createdIssue.key} with sprint value:`,
          sprintValueToAssign,
        );

        try {
          const sprintId = await this.sprintApi.handleSprintCreation(
            {},
            sprintValueToAssign,
          );
          if (sprintId) {
            logger.debug(
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

            logger.debug(
              `Making post-creation Agile API call to: ${agileAxios.defaults.baseURL}${agileApiUrl}`,
            );
            logger.debug(`Request payload:`, { issues: [createdIssue.key] });

            const response = await agileAxios.post(agileApiUrl, {
              issues: [createdIssue.key],
            });

            logger.debug(
              `Post-creation Agile API response:`,
              response.status,
              response.data,
            );
            logger.info(
              `Successfully assigned issue ${createdIssue.key} to sprint ID ${sprintId} after creation`,
            );
          } else {
            logger.warn(
              `Could not determine sprint ID for value "${sprintValueToAssign}", skipping sprint assignment`,
            );
          }
        } catch (sprintError) {
          logger.error(
            `Failed to assign sprint after issue creation:`,
            sprintError,
          );
          // Don't fail the entire creation process if sprint assignment fails
          logger.warn(
            `Issue ${createdIssue.key} was created successfully but sprint assignment failed`,
          );
        }
      }

      return createdIssue;
    } catch (error) {
      logger.error(`[createIssue] Error occurred during issue creation`);
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
              logger.error(`  Field "${fieldName}": ${errorMessage}`);
            }
          }

          // Log general error messages
          if (errorMessages && errorMessages.length > 0) {
            logger.error(
              `[createIssue] General error messages (${errorMessages.length} messages):`,
            );
            for (const errorMessage of errorMessages) {
              logger.error(`  ${errorMessage}`);
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
      }

      logger.error(
        `[createIssue] Unable to automatically correct the error`,
      );
      logger.error(`[createIssue] Summary of issue creation attempt:`);
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
      const fieldMetadata = await this.fieldApi.getFieldMetadata(issueTypeId);

      // Handle common fields
      if (summary) updateData.fields.summary = summary;
      if (description) updateData.fields.description = description;

      // Process assignee field
      if (assignee) {
        const assigneeMetadata = fieldMetadata["assignee"];
        if (assigneeMetadata) {
          updateData.fields.assignee = this.fieldApi.formatValueBasedOnMetadata(
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
          updateData.fields.reporter = this.fieldApi.formatValueBasedOnMetadata(
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
          await this.sprintApi.handleSprintUpdate(updateData, value, issue_key);
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
          updateData.fields[fieldId] = this.fieldApi.formatValueBasedOnMetadata(
            fieldId,
            value,
            metadata,
          );
          logger.debug(
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
              logger.debug(
                `Found field ${key} in global cache as ${globalField.name} (${globalField.id})`,
              );
            }
          }

          if (globalFieldMetadata) {
            // Use global field metadata to format the value
            updateData.fields[fieldId] = this.fieldApi.formatValueBasedOnMetadata(
              fieldId,
              value,
              globalFieldMetadata,
            );
            logger.debug(
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
                    this.fieldApi.formatValueBasedOnMetadata(
                      templateFieldId,
                      value,
                      templateMetadata,
                    );
                  logger.debug(
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
                  logger.debug(
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
              logger.debug(
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
                  logger.debug(
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
                    logger.debug(
                      `Updated custom field ${key} (${fieldId}) as multi-value:`,
                      updateData.fields[fieldId],
                    );
                  } else {
                    // Single value - try both direct value and object format
                    updateData.fields[fieldId] = { value };
                    logger.debug(
                      `Updated custom field ${key} (${fieldId}) as single value object:`,
                      updateData.fields[fieldId],
                    );
                  }
                }
              } else {
                // Standard fields - use direct value
                updateData.fields[fieldId] = value;
                logger.debug(
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
   * Handle fixVersions field update with proper validation and mapping
   * @param updateData Update data object to modify
   * @param value Version value (name or ID)
   */
  private async handleFixVersionsUpdate(
    updateData: any,
    value: string,
  ): Promise<void> {
    try {
      logger.debug(`Handling fixVersions update with value: ${value}`);

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
        logger.debug(
          `Found matching fixVersion: ${matchingVersion.name} (ID: ${matchingVersion.id})`,
        );
      } else {
        // If no match found, create a new version or use as-is
        logger.debug(`No matching fixVersion found for "${value}"`);

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
          logger.info(
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
      logger.debug(`Handling versions update with value: ${value}`);

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
        logger.debug(
          `Found matching version: ${matchingVersion.name} (ID: ${matchingVersion.id})`,
        );
      } else {
        // If no match found, create a new version or use as-is
        logger.debug(`No matching version found for "${value}"`);

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
          logger.info(
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
      logger.debug("Failed to fetch dynamic metadata, using fallback:", error);
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
