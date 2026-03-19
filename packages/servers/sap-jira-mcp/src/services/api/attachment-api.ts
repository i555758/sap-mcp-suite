/**
 * Attachment API module for Jira
 * Handles attachment operations: download, upload, delete
 */
import { promises as fs } from "fs";
import { join } from "path";
import FormData from "form-data";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import {
  DownloadAttachmentRequest,
  UploadAttachmentRequest,
  DeleteAttachmentRequest,
} from "../../types.js";
import { BaseJiraApi } from "./base.js";
import { logger } from "../../utils/logger.js";

/**
 * Jira attachment metadata from the API
 */
interface JiraAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  content: string; // URL to download the attachment
}

/**
 * Result for a single downloaded attachment
 */
interface DownloadedAttachment {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  content: string; // base64-encoded content
  downloaded: boolean;
  saved: boolean;
}

/**
 * Result for the download attachment operation
 */
interface DownloadAttachmentResult {
  issue_key: string;
  attachments: DownloadedAttachment[];
  count: number;
}

/**
 * Attachment API class for managing Jira issue attachments
 */
export class AttachmentApi extends BaseJiraApi {
  /**
   * Download attachments from an issue
   * @param request Download attachment request
   * @returns Object containing downloaded attachments with base64-encoded content
   */
  async downloadAttachment(
    request: DownloadAttachmentRequest,
  ): Promise<DownloadAttachmentResult> {
    try {
      // Fetch the issue with only the attachment field
      const response = await this.axiosInstance.get(
        `/issue/${request.issue_key}?fields=attachment`,
      );
      const issue = response.data as {
        fields: { attachment?: JiraAttachment[] };
      };

      if (
        !issue.fields.attachment ||
        issue.fields.attachment.length === 0
      ) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `No attachments found on issue ${request.issue_key}`,
        );
      }

      const attachments = issue.fields.attachment;
      let targetAttachments = attachments;

      // Filter by attachment_id or filename if specified
      if (request.attachment_id) {
        targetAttachments = attachments.filter(
          (att) => att.id === request.attachment_id,
        );
        if (targetAttachments.length === 0) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Attachment with ID ${request.attachment_id} not found`,
          );
        }
      } else if (request.filename) {
        targetAttachments = attachments.filter(
          (att) => att.filename === request.filename,
        );
        if (targetAttachments.length === 0) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Attachment with filename ${request.filename} not found`,
          );
        }
      }

      const results: DownloadedAttachment[] = [];

      for (const attachment of targetAttachments) {
        logger.info(
          `Downloading attachment: ${attachment.filename} (${attachment.size} bytes)`,
        );

        // Download the attachment content
        const downloadResponse = await this.axiosInstance.get(
          attachment.content.replace(this.BASE_URL, ""),
          {
            responseType: "arraybuffer",
            baseURL: this.BASE_URL,
          },
        );

        const buffer = Buffer.from(downloadResponse.data as ArrayBuffer);

        // Save to file if save_path provided
        if (request.save_path) {
          try {
            const filepath = join(request.save_path, attachment.filename);
            await fs.writeFile(filepath, buffer);
            logger.info(`Saved to: ${filepath}`);
          } catch (err) {
            logger.error(`Failed to save ${attachment.filename}:`, err);
          }
        }

        const base64Data = buffer.toString("base64");

        results.push({
          id: attachment.id,
          filename: attachment.filename,
          size: attachment.size,
          mimeType: attachment.mimeType,
          content: base64Data,
          downloaded: true,
          saved: !!request.save_path,
        });

        logger.info(`Downloaded: ${attachment.filename}`);
      }

      return {
        issue_key: request.issue_key,
        attachments: results,
        count: results.length,
      };
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Upload one or more attachments to a Jira issue
   * @param request Upload attachment request
   * @returns Array of created attachment objects from the Jira API
   */
  async uploadAttachment(
    request: UploadAttachmentRequest,
  ): Promise<JiraAttachment[]> {
    try {
      const form = new FormData();

      // Handle file from path or base64 content
      if (request.file_path) {
        logger.info(`Uploading attachment from file: ${request.file_path}`);
        const fileContent = await fs.readFile(request.file_path);
        const fileName =
          request.file_name ||
          request.file_path.split("/").pop() ||
          "attachment";
        form.append("file", fileContent, { filename: fileName });
      } else if (request.file_content) {
        logger.info("Uploading attachment from base64 content");
        const buffer = Buffer.from(request.file_content, "base64");
        const fileName = request.file_name || "attachment.bin";
        form.append("file", buffer, { filename: fileName });
      } else {
        throw new McpError(
          ErrorCode.InvalidRequest,
          "Either file_path or file_content must be provided",
        );
      }

      // Use the full URL for attachment upload with multipart/form-data headers
      const response = await this.axiosInstance.post(
        `${this.BASE_URL}/rest/api/2/issue/${request.issue_key}/attachments`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            "X-Atlassian-Token": "no-check", // Required to bypass CSRF check
          },
        },
      );

      logger.info(`Uploaded attachment(s) to ${request.issue_key}`);
      return response.data as JiraAttachment[];
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Delete an attachment from Jira
   * @param request Delete attachment request
   */
  async deleteAttachment(request: DeleteAttachmentRequest): Promise<void> {
    try {
      logger.info(`Deleting attachment: ${request.attachment_id}`);

      await this.axiosInstance.delete(
        `/attachment/${request.attachment_id}`,
        {
          headers: {
            "X-Atlassian-Token": "no-check",
          },
        },
      );

      logger.info(`Deleted attachment: ${request.attachment_id}`);
    } catch (error) {
      this.handleApiError(error);
      throw error;
    }
  }
}
