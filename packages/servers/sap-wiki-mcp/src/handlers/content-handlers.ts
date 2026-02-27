/**
 * Content handlers for SAP Wiki MCP
 * Handles: wiki_content, wiki_update_page, wiki_create_page, wiki_delete_page
 */
import { z } from "zod";
import { textResponse, textError, extractErrorMessage, wrapToolHandler } from "mcp-utils";
import { isAuthError } from "sap-auth";
import { WikiHttpClient } from "../api/wiki-client.js";
import type { WikiHandlerContext, AuthErrorHandler } from "./types.js";

// Schema for wiki_content tool
export const WikiContentSchema = z.object({
  url: z.string().describe("The complete wiki URL to fetch content from"),
  raw: z
    .boolean()
    .optional()
    .default(false)
    .describe("Return raw HTML content without cleaning (default: false)"),
  format: z
    .enum(["text", "storage"])
    .optional()
    .default("text")
    .describe("Output format: 'text' (default) for readable content, 'storage' for Confluence XML format with version info (needed for editing)"),
});

// Schema for wiki_update_page tool
export const WikiUpdatePageSchema = z.object({
  pageId: z
    .string()
    .describe("The Confluence page ID to update (e.g., '5825274447')"),
  content: z
    .string()
    .describe("The new page content in Confluence storage format (XML). Must be obtained by first reading the page with format='storage'"),
  version: z
    .number()
    .describe("The current version number of the page (obtained from reading the page with format='storage'). This prevents overwriting concurrent edits."),
  title: z
    .string()
    .optional()
    .describe("Optional: New title for the page. If not provided, keeps the existing title."),
  comment: z
    .string()
    .optional()
    .describe("Optional: Version comment describing what was changed (e.g., 'Added new KT recording')"),
});

// Schema for wiki_create_page tool
export const WikiCreatePageSchema = z.object({
  spaceKey: z
    .string()
    .describe("The space key where the page will be created (e.g., 'BDCCatBR', 'MOB'). You can find the space key in the wiki URL."),
  title: z
    .string()
    .describe("The title of the new page"),
  content: z
    .string()
    .describe("The page content in Confluence storage format (XML). Can be simple HTML-like content or Confluence macros."),
  parentPageId: z
    .string()
    .optional()
    .describe("Optional: Parent page ID. If provided, creates the page as a child of this page. If not provided, creates at space root level."),
});

// Schema for wiki_delete_page tool
export const WikiDeletePageSchema = z.object({
  pageId: z
    .string()
    .describe("The Confluence page ID to delete (e.g., '5825274447')"),
});

/**
 * Handle wiki_content tool
 */
export async function handleWikiContent(
  args: unknown,
  client: WikiHttpClient,
  _apiToken?: string,
  authErrorHandler?: AuthErrorHandler
) {
  try {
    const { url, raw = false, format = "text" } = WikiContentSchema.parse(args);

    console.error(`Fetching wiki content from: ${url} (raw: ${raw}, format: ${format})`);

    // Validate URL is from the configured wiki domain
    const expectedDomain = client.getWikiDomain();
    if (!url.includes(expectedDomain)) {
      return textError(`INVALID_URL: URL must be from ${expectedDomain} domain. Received: ${url}`);
    }

    const startTime = Date.now();

    // Handle storage format - use REST API to get Confluence storage XML
    if (format === "storage") {
      // Extract pageId from URL - supports multiple formats:
      // 1. ?pageId=123456 (query parameter)
      // 2. /pages/viewpage.action?pageId=123456
      // 3. /spaces/SPACE/pages/123456/Title (pretty URL)
      // 4. /pages/123456 (short format)
      let pageId: string | null = null;

      // Try query parameter format first
      const queryParamMatch = url.match(/pageId=(\d+)/);
      if (queryParamMatch) {
        pageId = queryParamMatch[1];
      }

      // Try pretty URL format: /spaces/SPACE/pages/PAGEID/Title or /pages/PAGEID
      if (!pageId) {
        const prettyUrlMatch = url.match(/\/pages\/(\d+)(?:\/|$)/);
        if (prettyUrlMatch) {
          pageId = prettyUrlMatch[1];
        }
      }

      if (!pageId) {
        return textError("INVALID_URL: Could not extract pageId from URL. Supported formats:\n- ?pageId=123456\n- /spaces/SPACE/pages/123456/Title\n- /pages/123456");
      }

      const storageData = await client.getPageStorageFormat(pageId);
      const endTime = Date.now();
      console.error(`Storage format fetched in ${endTime - startTime}ms`);

      // Return structured data for editing
      const output = `Page ID: ${storageData.pageId}
Title: ${storageData.title}
Space: ${storageData.spaceKey}
Version: ${storageData.version}

--- STORAGE FORMAT CONTENT (use this for wiki_update_page) ---
${storageData.content}`;

      return textResponse(output);
    }

    // Default: text format
    const pageContent = await client.fetchWikiContent(url, raw);
    const endTime = Date.now();

    console.error(`Content fetched in ${endTime - startTime}ms`);

    return textResponse(pageContent);
  } catch (error) {
    console.error("Wiki content fetch error:", error);

    if (isAuthError(error) && authErrorHandler) {
      return await authErrorHandler();
    }

    return textError(`CONTENT_FETCH_ERROR: ${extractErrorMessage(error)}`);
  }
}

/**
 * Handle wiki_update_page tool
 */
export async function handleWikiUpdatePage(
  args: unknown,
  client: WikiHttpClient,
  _apiToken?: string,
  authErrorHandler?: AuthErrorHandler
) {
  try {
    const { pageId, content, version, title, comment } = WikiUpdatePageSchema.parse(args);

    console.error(`Updating wiki page: ${pageId} (version: ${version})`);

    const startTime = Date.now();
    const result = await client.updatePageContent(
      pageId,
      content,
      version,
      title,
      comment
    );
    const endTime = Date.now();

    console.error(`Page updated in ${endTime - startTime}ms (new version: ${result.newVersion})`);

    return textResponse(`Page updated successfully!

Page ID: ${result.pageId}
Title: ${result.title}
New Version: ${result.newVersion}
URL: ${result.url}`);
  } catch (error) {
    console.error("Wiki update error:", error);

    if (isAuthError(error) && authErrorHandler) {
      return await authErrorHandler();
    }

    if (error instanceof Error) {
      // Handle specific update errors
      if (error.message.includes("VERSION_CONFLICT")) {
        return textError("VERSION_CONFLICT: The page has been modified by someone else. Please re-read the page with format='storage' to get the latest version and try again.");
      }

      if (error.message.includes("ACCESS_FORBIDDEN")) {
        return textError("ACCESS_FORBIDDEN: You don't have permission to edit this page.");
      }

      if (error.message.includes("INVALID_CONTENT")) {
        return textError(`INVALID_CONTENT: ${error.message}. Make sure the content is valid Confluence storage format.`);
      }
    }

    return textError(`UPDATE_ERROR: ${extractErrorMessage(error)}`);
  }
}

/**
 * Handle wiki_create_page tool
 */
export async function handleWikiCreatePage(
  args: unknown,
  client: WikiHttpClient,
  _apiToken?: string,
  authErrorHandler?: AuthErrorHandler
) {
  try {
    const { spaceKey, title, content, parentPageId } = WikiCreatePageSchema.parse(args);

    console.error(`Creating wiki page: "${title}" in space ${spaceKey}${parentPageId ? ` (parent: ${parentPageId})` : ''}`);

    const startTime = Date.now();
    const result = await client.createPage(spaceKey, title, content, parentPageId);
    const endTime = Date.now();

    console.error(`Page created in ${endTime - startTime}ms (pageId: ${result.pageId})`);

    return textResponse(`Page created successfully!

Page ID: ${result.pageId}
Title: ${result.title}
Space: ${result.spaceKey}
Version: ${result.version}
URL: ${result.url}`);
  } catch (error) {
    console.error("Wiki create page error:", error);

    if (isAuthError(error) && authErrorHandler) {
      return await authErrorHandler();
    }

    if (error instanceof Error) {
      // Handle specific create errors
      if (error.message.includes("DUPLICATE_TITLE")) {
        return textError(error.message);
      }

      if (error.message.includes("ACCESS_FORBIDDEN")) {
        return textError("ACCESS_FORBIDDEN: You don't have permission to create pages in this space.");
      }

      if (error.message.includes("SPACE_NOT_FOUND")) {
        return textError(error.message);
      }

      if (error.message.includes("INVALID_REQUEST")) {
        return textError(`${error.message}. Make sure the content is valid Confluence storage format.`);
      }
    }

    return textError(`CREATE_PAGE_ERROR: ${extractErrorMessage(error)}`);
  }
}

/**
 * Handle wiki_delete_page tool
 */
export async function handleWikiDeletePage(
  args: unknown,
  client: WikiHttpClient,
  _apiToken?: string,
  authErrorHandler?: AuthErrorHandler
) {
  try {
    const { pageId } = WikiDeletePageSchema.parse(args);

    console.error(`Deleting wiki page: ${pageId}`);

    const startTime = Date.now();
    const result = await client.deletePage(pageId);
    const endTime = Date.now();

    console.error(`Page deleted in ${endTime - startTime}ms`);

    return textResponse(`Page deleted successfully!

Page ID: ${result.pageId}`);
  } catch (error) {
    console.error("Wiki delete page error:", error);

    if (isAuthError(error) && authErrorHandler) {
      return await authErrorHandler();
    }

    if (error instanceof Error) {
      // Handle specific delete errors
      if (error.message.includes("PAGE_NOT_FOUND")) {
        return textError(error.message);
      }

      if (error.message.includes("ACCESS_FORBIDDEN")) {
        return textError("ACCESS_FORBIDDEN: You don't have permission to delete this page.");
      }
    }

    return textError(`DELETE_PAGE_ERROR: ${extractErrorMessage(error)}`);
  }
}

/**
 * Register all content-related tools
 */
export function registerContentHandlers(context: WikiHandlerContext): void {
  const { server, getHttpClient, apiToken, authErrorHandler } = context;

  const errorOptions = {
    isAuthError,
    onAuthError: (_error: unknown) => authErrorHandler(),
  };

  // wiki_content tool
  server.registerTool(
    "wiki_content",
    {
      title: "Wiki Content",
      description:
        "Fetch complete content from a specific wiki page URL. Use URLs from search results to get detailed page content.",
      inputSchema: {
        url: z
          .string()
          .describe(
            "The complete wiki URL to fetch content from (e.g., https://wiki.one.int.sap/wiki/pages/viewpage.action?pageId=123456)"
          ),
        raw: z
          .boolean()
          .optional()
          .default(false)
          .describe("Return raw HTML content without cleaning (default: false)"),
        format: z
          .enum(["text", "storage"])
          .optional()
          .default("text")
          .describe(
            "Output format: 'text' (default) for readable content, 'storage' for Confluence XML format with version info (needed for editing)"
          ),
      },
    },
    wrapToolHandler(
      async (args: any) => {
        const client = await getHttpClient();
        return await handleWikiContent(args, client, apiToken, authErrorHandler);
      },
      errorOptions
    )
  );

  // wiki_update_page tool
  server.registerTool(
    "wiki_update_page",
    {
      title: "Wiki Update Page",
      description:
        "Update a wiki page's content. IMPORTANT: You must first read the page using wiki_content with format='storage' to get the current content and version number. This tool will fail if you haven't read the page first.",
      inputSchema: {
        pageId: z
          .string()
          .describe("The Confluence page ID to update (e.g., '5825274447')"),
        content: z
          .string()
          .describe(
            "The new page content in Confluence storage format (XML). Must be obtained by first reading the page with format='storage'"
          ),
        version: z
          .number()
          .describe(
            "The current version number of the page (obtained from reading the page with format='storage'). This prevents overwriting concurrent edits."
          ),
        title: z
          .string()
          .optional()
          .describe(
            "Optional: New title for the page. If not provided, keeps the existing title."
          ),
        comment: z
          .string()
          .optional()
          .describe(
            "Optional: Version comment describing what was changed (e.g., 'Added new KT recording')"
          ),
      },
    },
    wrapToolHandler(
      async (args: any) => {
        const client = await getHttpClient();
        return await handleWikiUpdatePage(args, client, apiToken, authErrorHandler);
      },
      errorOptions
    )
  );

  // wiki_create_page tool
  server.registerTool(
    "wiki_create_page",
    {
      title: "Wiki Create Page",
      description:
        "Create a new wiki page in a specified space. You can optionally specify a parent page to create it as a child page.",
      inputSchema: {
        spaceKey: z
          .string()
          .describe(
            "The space key where the page will be created (e.g., 'BDCCatBR', 'MOB'). You can find the space key in the wiki URL."
          ),
        title: z.string().describe("The title of the new page"),
        content: z
          .string()
          .describe(
            "The page content in Confluence storage format (XML). Can be simple HTML-like content or Confluence macros."
          ),
        parentPageId: z
          .string()
          .optional()
          .describe(
            "Optional: Parent page ID. If provided, creates the page as a child of this page. If not provided, creates at space root level."
          ),
      },
    },
    wrapToolHandler(
      async (args: any) => {
        const client = await getHttpClient();
        return await handleWikiCreatePage(args, client, apiToken, authErrorHandler);
      },
      errorOptions
    )
  );

  // wiki_delete_page tool
  server.registerTool(
    "wiki_delete_page",
    {
      title: "Wiki Delete Page",
      description:
        "Delete a wiki page. WARNING: This action is irreversible. The page and all its content will be permanently deleted.",
      inputSchema: {
        pageId: z
          .string()
          .describe("The Confluence page ID to delete (e.g., '5825274447')"),
      },
    },
    wrapToolHandler(
      async (args: any) => {
        const client = await getHttpClient();
        return await handleWikiDeletePage(args, client, apiToken, authErrorHandler);
      },
      errorOptions
    )
  );
}
