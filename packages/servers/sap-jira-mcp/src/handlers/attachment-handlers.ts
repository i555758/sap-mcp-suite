/**
 * Attachment-related Jira tool handlers
 * Includes: download_attachment, upload_attachment, delete_attachment
 */
import { z } from "zod";
import { HandlerContext } from "./types.js";
import { textResponse, jsonResponse } from "mcp-utils";

/**
 * Register attachment-related tools
 */
export function registerAttachmentHandlers(context: HandlerContext): void {
  const {
    server,
    getJiraApiService,
    initializeServices,
  } = context;

  // Download Attachment Tool
  server.registerTool(
    "download_attachment",
    {
      title: "Download Attachment",
      description:
        "Download one or more attachments from a JIRA issue. Returns base64-encoded content.",
      inputSchema: {
        issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
        attachment_id: z
          .string()
          .optional()
          .describe("Specific attachment ID to download (optional)"),
        filename: z
          .string()
          .optional()
          .describe("Specific filename to download (optional)"),
        save_path: z
          .string()
          .optional()
          .describe("Local path to save files (optional)"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.downloadAttachment(args);

      const attachmentSummary = result.attachments
        .map(
          (att) =>
            `- ${att.filename} (${att.size} bytes, ${att.mimeType})`,
        )
        .join("\n");

      return jsonResponse({
        message: `Downloaded ${result.count} attachment(s) from ${result.issue_key}:\n${attachmentSummary}`,
        data: result,
      });
    },
  );

  // Upload Attachment Tool
  server.registerTool(
    "upload_attachment",
    {
      title: "Upload Attachment",
      description:
        "Upload one or more attachments to a JIRA issue. Provide either file_path (local file) or file_content (base64-encoded).",
      inputSchema: {
        issue_key: z.string().describe("Issue key (e.g., PRJ-123)"),
        file_path: z
          .string()
          .optional()
          .describe("Local file path to upload"),
        file_content: z
          .string()
          .optional()
          .describe(
            "Base64-encoded file content (alternative to file_path)",
          ),
        file_name: z
          .string()
          .optional()
          .describe(
            "File name to use (optional, derived from file_path if not provided)",
          ),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      const result = await jiraApiService.uploadAttachment(args);

      const attachmentSummary = result
        .map(
          (att) =>
            `- ${att.filename} (ID: ${att.id}, ${att.size} bytes)`,
        )
        .join("\n");

      return jsonResponse({
        message: `Uploaded ${result.length} attachment(s) to ${args.issue_key}:\n${attachmentSummary}`,
        data: result,
      });
    },
  );

  // Delete Attachment Tool
  server.registerTool(
    "delete_attachment",
    {
      title: "Delete Attachment",
      description:
        "Delete an attachment from JIRA by attachment ID. You can get attachment IDs from get_issue or download_attachment.",
      inputSchema: {
        attachment_id: z
          .string()
          .describe("The attachment ID to delete"),
      },
    },
    async (args) => {
      await initializeServices();

      const jiraApiService = getJiraApiService();

      if (!jiraApiService) {
        throw new Error("Services not initialized");
      }

      await jiraApiService.deleteAttachment(args);
      return textResponse(
        `Deleted attachment: ${args.attachment_id}`,
      );
    },
  );
}
