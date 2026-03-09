/**
 * Content handlers for SAP Wiki MCP
 * Handles: wiki_content, wiki_update_page, wiki_create_page, wiki_delete_page
 */
import { z } from "zod";
import { textResponse, textError, extractErrorMessage, wrapToolHandler } from "mcp-utils";
import { isAuthError } from "sap-auth";
import { WikiHttpClient } from "../api/wiki-client.js";
import type { WikiHandlerContext, AuthErrorHandler } from "./types.js";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const WIKI_TMP_DIR = tmpdir();

// Metadata comment prefix used in saved wiki files
const META_PREFIX = "<!-- wiki_meta:";
const META_SUFFIX = " -->";

/**
 * Build a temp file path for a wiki page: /tmp/wiki_{pageId}_v{version}.xml
 */
function buildWikiFilePath(pageId: string, version: number): string {
  return join(WIKI_TMP_DIR, `wiki_${pageId}_v${version}.xml`);
}

/**
 * Build a metadata comment line to embed in the saved file.
 * Format: <!-- wiki_meta:pageId=123;version=5;title=My Page;space=BDC -->
 */
function buildMetaComment(pageId: string, version: number, title: string, spaceKey: string): string {
  return `${META_PREFIX}pageId=${pageId};version=${version};title=${title};space=${spaceKey}${META_SUFFIX}`;
}

/**
 * Parse metadata from a wiki file's first line.
 * Returns null if the file doesn't have a valid meta comment.
 */
function parseMetaComment(fileContent: string): {
  pageId: string;
  version: number;
  title: string;
  spaceKey: string;
  content: string;
} | null {
  const firstNewline = fileContent.indexOf("\n");
  if (firstNewline === -1) return null;

  const firstLine = fileContent.substring(0, firstNewline);
  if (!firstLine.startsWith(META_PREFIX) || !firstLine.endsWith(META_SUFFIX)) return null;

  const metaStr = firstLine.substring(META_PREFIX.length, firstLine.length - META_SUFFIX.length);
  const pairs: Record<string, string> = {};
  for (const pair of metaStr.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    pairs[pair.substring(0, eqIdx)] = pair.substring(eqIdx + 1);
  }

  if (!pairs.pageId || !pairs.version || !pairs.title || !pairs.space) return null;

  return {
    pageId: pairs.pageId,
    version: parseInt(pairs.version, 10),
    title: pairs.title,
    spaceKey: pairs.space,
    content: fileContent.substring(firstNewline + 1),
  };
}

// Schema for wiki_content tool
export const WikiContentSchema = z.object({
  url: z.string().describe("The complete wiki URL to fetch content from"),
  format: z
    .enum(["text", "storage"])
    .optional()
    .default("text")
    .describe("Output format: 'text' (default) returns plain readable text, 'storage' saves Confluence XML to a temp file for editing"),
});

// Schema for wiki_update_page tool
export const WikiUpdatePageSchema = z.object({
  file_path: z
    .string()
    .describe("Path to the temp file saved by wiki_content (e.g., /tmp/wiki_123_v5.xml). All metadata (pageId, version, title) is read from the file."),
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
    const { url, format = "text" } = WikiContentSchema.parse(args);

    console.error(`Fetching wiki content from: ${url} (format: ${format})`);

    // Validate URL is from the configured wiki domain
    const expectedDomain = client.getWikiDomain();
    if (!url.includes(expectedDomain)) {
      return textError(`INVALID_URL: URL must be from ${expectedDomain} domain. Received: ${url}`);
    }

    const startTime = Date.now();

    // Handle storage format - save to temp file
    if (format === "storage") {
      let pageId: string | null = null;

      const queryParamMatch = url.match(/pageId=(\d+)/);
      if (queryParamMatch) {
        pageId = queryParamMatch[1];
      }

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

      // Save content to temp file with metadata header
      const filePath = buildWikiFilePath(storageData.pageId, storageData.version);
      const metaLine = buildMetaComment(storageData.pageId, storageData.version, storageData.title, storageData.spaceKey);
      writeFileSync(filePath, metaLine + "\n" + storageData.content, "utf-8");
      console.error(`Storage content saved to: ${filePath}`);

      return textResponse(`Page ID: ${storageData.pageId}
Title: ${storageData.title}
Space: ${storageData.spaceKey}
Version: ${storageData.version}
File: ${filePath}

Content saved to file. Use the Read/Edit tools to modify the file, then call wiki_update_page with file_path="${filePath}" to upload.`);
    }

    // Default: text format (cleaned, no HTML)
    const pageContent = await client.fetchWikiContent(url, false);
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
    const { file_path, comment } = WikiUpdatePageSchema.parse(args);

    if (!existsSync(file_path)) {
      return textError(`FILE_NOT_FOUND: ${file_path} does not exist. Re-fetch the page with wiki_content format='storage'.`);
    }

    const fileContent = readFileSync(file_path, "utf-8");
    const meta = parseMetaComment(fileContent);
    if (!meta) {
      return textError("INVALID_FILE: File is missing the metadata header. Re-fetch the page with wiki_content format='storage'.");
    }

    const { pageId, version, title, content } = meta;

    // Version check: fetch current version from Confluence
    console.error(`Checking version for page ${pageId} (local: v${version})...`);
    const currentPage = await client.getPageStorageFormat(pageId);
    if (currentPage.version !== version) {
      return textError(`VERSION_MISMATCH: Local file is v${version} but wiki is v${currentPage.version}. The page has been modified. Re-fetch with wiki_content format='storage' to get the latest version.`);
    }

    console.error(`Version check passed (v${version}). Updating page ${pageId}...`);

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
      if (error.message.includes("VERSION_CONFLICT")) {
        return textError("VERSION_CONFLICT: The page has been modified by someone else. Re-fetch with wiki_content format='storage' to get the latest version.");
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
        "Fetch content from a wiki page URL. format='text' returns plain readable text inline. format='storage' saves Confluence XML to a temp file for editing — use the Edit tool to modify it, then wiki_update_page to upload.",
      inputSchema: {
        url: z
          .string()
          .describe(
            "The complete wiki URL to fetch content from (e.g., https://wiki.one.int.sap/wiki/pages/viewpage.action?pageId=123456)"
          ),
        format: z
          .enum(["text", "storage"])
          .optional()
          .default("text")
          .describe(
            "Output format: 'text' (default) returns plain readable text, 'storage' saves Confluence XML to a temp file for editing"
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
        "Update a wiki page from a temp file saved by wiki_content (format='storage'). Reads pageId, version, and title from the file's metadata header. Checks the version against Confluence before uploading to prevent stale updates.",
      inputSchema: {
        file_path: z
          .string()
          .describe(
            "Path to the temp file saved by wiki_content (e.g., /tmp/wiki_123_v5.xml). All metadata is embedded in the file."
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
