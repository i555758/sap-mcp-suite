#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PureWikiHttpClient } from "./pure-http-client.js";

// Read configuration from environment variables
const WIKI_DOMAIN = process.env.WIKI_DOMAIN;
const WIKI_API_TOKEN = process.env.WIKI_API_TOKEN;

// Log configuration mode at startup
if (WIKI_DOMAIN && WIKI_API_TOKEN) {
  console.error(
    `🌐 Custom domain mode: ${WIKI_DOMAIN} with PAT authentication`,
  );
} else if (WIKI_DOMAIN) {
  console.error(
    `⚠️  WIKI_DOMAIN set but WIKI_API_TOKEN missing. Falling back to default domain.`,
  );
} else {
  console.error(
    `🏢 SAP Wiki mode: wiki.one.int.sap with cookie authentication`,
  );
}

const server = new Server(
  {
    name: "sap-wiki-mcp",
    version: "1.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Schema for general_search tool
const GeneralSearchSchema = z.object({
  keyword: z
    .string()
    .describe("The search keyword or phrase to search for in SAP Wiki"),
  start: z
    .number()
    .optional()
    .default(0)
    .describe("Starting index for pagination (default: 0)"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of results to return (default: 20, max: 100)"),
});

// Schema for cql_search tool
const CqlSearchSchema = z.object({
  cql: z
    .string()
    .describe(
      'Full CQL (Confluence Query Language) query string. Examples: "siteSearch ~ \\"keyword\\" AND type in (\\"page\\", \\"blogpost\\")", "space = \\"SPACEKEY\\" AND title ~ \\"search term\\""',
    ),
  start: z
    .number()
    .optional()
    .default(0)
    .describe("Starting index for pagination (default: 0)"),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe("Maximum number of results to return (default: 20, max: 100)"),
});

// Schema for wiki_content tool
const WikiContentSchema = z.object({
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
const WikiUpdatePageSchema = z.object({
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
const WikiCreatePageSchema = z.object({
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
const WikiDeletePageSchema = z.object({
  pageId: z
    .string()
    .describe("The Confluence page ID to delete (e.g., '5825274447')"),
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: any[] = [
    {
      name: "general_search",
      description:
        "Search the SAP Wiki for content using a keyword or phrase. If authentication is required, will return an error asking to run authenticate tool first.",
      inputSchema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description:
              "The search keyword or phrase to search for in SAP Wiki",
          },
          start: {
            type: "number",
            description: "Starting index for pagination (default: 0)",
            default: 0,
          },
          limit: {
            type: "number",
            description:
              "Maximum number of results to return (default: 20, max: 100)",
            default: 20,
          },
        },
        required: ["keyword"],
      },
    },
    {
      name: "cql_examples",
      description:
        "Get practical CQL query examples with syntax reference for SAP Wiki. Provides verified working CQL examples and syntax rules. 💡 TIP: Always use this tool first before constructing CQL queries to understand the correct syntax.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "cql_search",
      description:
        "Search SAP Wiki using full CQL (Confluence Query Language) queries. Supports advanced filtering, sorting, and all standard CQL functions. 💡 TIP: For effective CQL usage, run cql_examples first to get current SAP Wiki CQL syntax and ready-to-use query examples.",
      inputSchema: {
        type: "object",
        properties: {
          cql: {
            type: "string",
            description:
              'Full CQL (Confluence Query Language) query string. Examples: "siteSearch ~ \\"keyword\\" AND type in (\\"page\\", \\"blogpost\\")", "space = \\"SPACEKEY\\" AND title ~ \\"search term\\""',
          },
          start: {
            type: "number",
            description: "Starting index for pagination (default: 0)",
            default: 0,
          },
          limit: {
            type: "number",
            description:
              "Maximum number of results to return (default: 20, max: 100)",
            default: 20,
          },
        },
        required: ["cql"],
      },
    },
    {
      name: "wiki_content",
      description:
        "Fetch complete content from a specific wiki page URL. Use URLs from search results to get detailed page content.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "The complete wiki URL to fetch content from (e.g., https://wiki.one.int.sap/wiki/pages/viewpage.action?pageId=123456)",
          },
          raw: {
            type: "boolean",
            description:
              "Return raw HTML content without cleaning (default: false)",
            default: false,
          },
          format: {
            type: "string",
            enum: ["text", "storage"],
            description:
              "Output format: 'text' (default) for readable content, 'storage' for Confluence XML format with version info (needed for editing)",
            default: "text",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "wiki_update_page",
      description:
        "Update a wiki page's content. IMPORTANT: You must first read the page using wiki_content with format='storage' to get the current content and version number. This tool will fail if you haven't read the page first.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description:
              "The Confluence page ID to update (e.g., '5825274447')",
          },
          content: {
            type: "string",
            description:
              "The new page content in Confluence storage format (XML). Must be obtained by first reading the page with format='storage'",
          },
          version: {
            type: "number",
            description:
              "The current version number of the page (obtained from reading the page with format='storage'). This prevents overwriting concurrent edits.",
          },
          title: {
            type: "string",
            description:
              "Optional: New title for the page. If not provided, keeps the existing title.",
          },
          comment: {
            type: "string",
            description:
              "Optional: Version comment describing what was changed (e.g., 'Added new KT recording')",
          },
        },
        required: ["pageId", "content", "version"],
      },
    },
    {
      name: "wiki_create_page",
      description:
        "Create a new wiki page in a specified space. You can optionally specify a parent page to create it as a child page.",
      inputSchema: {
        type: "object",
        properties: {
          spaceKey: {
            type: "string",
            description:
              "The space key where the page will be created (e.g., 'BDCCatBR', 'MOB'). You can find the space key in the wiki URL.",
          },
          title: {
            type: "string",
            description: "The title of the new page",
          },
          content: {
            type: "string",
            description:
              "The page content in Confluence storage format (XML). Can be simple HTML-like content or Confluence macros.",
          },
          parentPageId: {
            type: "string",
            description:
              "Optional: Parent page ID. If provided, creates the page as a child of this page. If not provided, creates at space root level.",
          },
        },
        required: ["spaceKey", "title", "content"],
      },
    },
    {
      name: "wiki_delete_page",
      description:
        "Delete a wiki page. WARNING: This action is irreversible. The page and all its content will be permanently deleted.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description:
              "The Confluence page ID to delete (e.g., '5825274447')",
          },
        },
        required: ["pageId"],
      },
    },
  ];

  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "general_search") {
    try {
      const {
        keyword,
        start = 0,
        limit = 20,
      } = GeneralSearchSchema.parse(args);
      const validatedLimit = Math.min(Math.max(1, limit), 100);

      console.error(
        `🔍 Search request: "${keyword}" (start: ${start}, limit: ${validatedLimit})`,
      );

      // Direct search attempt - let authentication errors bubble up naturally
      const httpClient = new PureWikiHttpClient(WIKI_DOMAIN, WIKI_API_TOKEN);
      await httpClient.initialize();

      const startTime = Date.now();
      const searchResponse = await httpClient.searchWiki(
        keyword,
        start,
        validatedLimit,
      );
      const endTime = Date.now();

      console.error(`✅ Search completed in ${endTime - startTime}ms`);

      // Return search results directly
      const totalResults = searchResponse.totalSize || 0;
      const results = searchResponse.results || [];
      const formattedOutput =
        `Found ${totalResults} results for "${keyword}"\n\n` +
        results
          .slice(0, 10)
          .map((result: any, index: number) => {
            const title = result.title || "Untitled";
            const url =
              result.url ||
              (result._links?.webui
                ? `https://wiki.one.int.sap${result._links.webui}`
                : "No URL");
            const excerpt = result.excerpt || "No description available";
            return `${index + 1}. ${title}\n   URL: ${url}\n   ${excerpt}\n`;
          })
          .join("\n");

      return {
        content: [
          {
            type: "text",
            text: formattedOutput,
          },
        ],
      };
    } catch (error) {
      console.error("❌ Search error:", error);

      if (error instanceof Error) {
        if (error.message === "AUTHENTICATION_REQUIRED") {
          // For PAT authentication, return clear error message
          if (WIKI_API_TOKEN) {
            return {
              content: [
                {
                  type: "text",
                  text: "AUTHENTICATION_ERROR: Invalid or expired API token. Please check your WIKI_API_TOKEN environment variable.",
                },
              ],
              isError: true,
            };
          }

          // For cookie-based auth, return structured error for sap-auth-mcp
          const httpClient = new PureWikiHttpClient(
            WIKI_DOMAIN,
            WIKI_API_TOKEN,
          );
          await httpClient.initialize();
          const storageInfo = await httpClient.getCookieStorageInfo();

          // Extract directory path from file path
          const storePath = storageInfo.filePath.substring(
            0,
            storageInfo.filePath.lastIndexOf("/"),
          );

          const structuredError = {
            error: "SAP_AUTH_REQUIRED",
            details:
              "Need call SAP auth MCP to prepare cookie and redo function after.",
            data: {
              store_path: storePath,
              entry_url: `https://${WIKI_DOMAIN || "wiki.one.int.sap"}/`,
            },
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(structuredError, null, 2),
              },
            ],
            isError: true,
          };
        } else if (error.message === "NETWORK_ERROR") {
          return {
            content: [
              {
                type: "text",
                text: "NETWORK_ERROR: Cannot connect to SAP Wiki. Check network connectivity.",
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `SEARCH_ERROR: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "cql_examples") {
    try {
      console.error("📚 Fetching CQL examples...");

      // Read the CQL examples file
      const { readFileSync } = await import("fs");
      const { join, dirname } = await import("path");
      const { fileURLToPath } = await import("url");

      const currentFileUrl = import.meta.url;
      const currentFilePath = fileURLToPath(currentFileUrl);
      const currentDir = dirname(currentFilePath);

      // Look for the file in src directory (for development) or current directory (for production)
      let examplesPath;
      try {
        examplesPath = join(currentDir, "cql_examples.md");
        readFileSync(examplesPath, "utf8");
      } catch (error) {
        // Try src directory
        examplesPath = join(dirname(currentDir), "src", "cql_examples.md");
      }

      const examplesContent = readFileSync(examplesPath, "utf8");

      console.error("✅ CQL examples loaded successfully");

      return {
        content: [
          {
            type: "text",
            text: examplesContent,
          },
        ],
      };
    } catch (error) {
      console.error("❌ CQL examples fetch error:", error);
      return {
        content: [
          {
            type: "text",
            text: `CQL_EXAMPLES_ERROR: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "cql_search") {
    try {
      const { cql, start = 0, limit = 20 } = CqlSearchSchema.parse(args);

      // Validate limit
      const validatedLimit = Math.min(Math.max(1, limit), 100);

      console.error(
        `🔍 CQL search request: "${cql}" (start: ${start}, limit: ${validatedLimit})`,
      );

      // Direct search attempt - let authentication errors bubble up naturally
      const httpClient = new PureWikiHttpClient(WIKI_DOMAIN, WIKI_API_TOKEN);
      await httpClient.initialize();

      const startTime = Date.now();
      const searchResponse = await httpClient.cqlSearch(
        cql,
        start,
        validatedLimit,
      );
      const endTime = Date.now();

      console.error(`✅ CQL search completed in ${endTime - startTime}ms`);

      // Return search results directly
      const totalResults = searchResponse.totalSize || 0;
      const results = searchResponse.results || [];

      let formattedOutput = `CQL Query: ${cql}\nFound ${totalResults} results\n\n`;

      if (results.length === 0) {
        formattedOutput += "No pages found matching your CQL query.";
      } else {
        formattedOutput += results
          .map((result: any, index: number) => {
            const title = result.title || "Untitled";
            const url =
              result.url ||
              (result._links?.webui
                ? `https://wiki.one.int.sap${result._links.webui}`
                : "No URL");
            const excerpt = result.excerpt || "No description available";
            const type = result.type || "Unknown Type";
            const space = result.space?.name || "Unknown Space";

            return `${start + index + 1}. ${title} (${type})
   Space: ${space}
   URL: ${url}
   ${excerpt}`;
          })
          .join("\n\n");

        if (totalResults > results.length) {
          const remaining = totalResults - (start + results.length);
          formattedOutput += `\n\n... and ${remaining} more results. Use start parameter to see more.`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: formattedOutput,
          },
        ],
      };
    } catch (error) {
      console.error("❌ CQL search error:", error);

      if (error instanceof Error) {
        if (error.message === "AUTHENTICATION_REQUIRED") {
          // For PAT authentication, return clear error message
          if (WIKI_API_TOKEN) {
            return {
              content: [
                {
                  type: "text",
                  text: "AUTHENTICATION_ERROR: Invalid or expired API token. Please check your WIKI_API_TOKEN environment variable.",
                },
              ],
              isError: true,
            };
          }

          // For cookie-based auth, return structured error for sap-auth-mcp
          const httpClient = new PureWikiHttpClient(
            WIKI_DOMAIN,
            WIKI_API_TOKEN,
          );
          await httpClient.initialize();
          const storageInfo = await httpClient.getCookieStorageInfo();

          // Extract directory path from file path
          const storePath = storageInfo.filePath.substring(
            0,
            storageInfo.filePath.lastIndexOf("/"),
          );

          const structuredError = {
            error: "SAP_AUTH_REQUIRED",
            details:
              "Need call SAP auth MCP to prepare cookie and redo function after.",
            data: {
              store_path: storePath,
              entry_url: `https://${WIKI_DOMAIN || "wiki.one.int.sap"}/`,
            },
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(structuredError, null, 2),
              },
            ],
            isError: true,
          };
        } else if (error.message === "NETWORK_ERROR") {
          return {
            content: [
              {
                type: "text",
                text: "NETWORK_ERROR: Cannot connect to SAP Wiki. Check network connectivity.",
              },
            ],
            isError: true,
          };
        } else if (error.message.includes("CQL query cannot be empty")) {
          return {
            content: [
              {
                type: "text",
                text: "CQL_ERROR: CQL query cannot be empty. Please provide a valid CQL query.",
              },
            ],
            isError: true,
          };
        } else if (error.message.includes("CQL_SYNTAX_ERROR")) {
          return {
            content: [
              {
                type: "text",
                text: `CQL_SYNTAX_ERROR: ${error.message.replace("CQL_SYNTAX_ERROR: ", "")}. This Confluence instance may not fully support CQL queries. Try using general_search instead for keyword-based search.`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `CQL_SEARCH_ERROR: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "wiki_content") {
    try {
      const { url, raw = false, format = "text" } = WikiContentSchema.parse(args);

      console.error(`📄 Fetching wiki content from: ${url} (raw: ${raw}, format: ${format})`);

      const httpClient = new PureWikiHttpClient(WIKI_DOMAIN, WIKI_API_TOKEN);
      await httpClient.initialize();

      // Validate URL is from the configured wiki domain
      const expectedDomain = httpClient.getWikiDomain();
      if (!url.includes(expectedDomain)) {
        return {
          content: [
            {
              type: "text",
              text: `INVALID_URL: URL must be from ${expectedDomain} domain. Received: ${url}`,
            },
          ],
          isError: true,
        };
      }

      const startTime = Date.now();

      // Handle storage format - use REST API to get Confluence storage XML
      if (format === "storage") {
        // Extract pageId from URL
        const pageIdMatch = url.match(/pageId=(\d+)/);
        if (!pageIdMatch) {
          return {
            content: [
              {
                type: "text",
                text: "INVALID_URL: Could not extract pageId from URL. URL must contain pageId parameter (e.g., ?pageId=123456)",
              },
            ],
            isError: true,
          };
        }
        const pageId = pageIdMatch[1];

        const storageData = await httpClient.getPageStorageFormat(pageId);
        const endTime = Date.now();
        console.error(`✅ Storage format fetched in ${endTime - startTime}ms`);

        // Return structured data for editing
        const output = `Page ID: ${storageData.pageId}
Title: ${storageData.title}
Space: ${storageData.spaceKey}
Version: ${storageData.version}

--- STORAGE FORMAT CONTENT (use this for wiki_update_page) ---
${storageData.content}`;

        return {
          content: [
            {
              type: "text",
              text: output,
            },
          ],
        };
      }

      // Default: text format
      const pageContent = await httpClient.fetchWikiContent(url, raw);
      const endTime = Date.now();

      console.error(`✅ Content fetched in ${endTime - startTime}ms`);

      return {
        content: [
          {
            type: "text",
            text: pageContent,
          },
        ],
      };
    } catch (error) {
      console.error("❌ Wiki content fetch error:", error);

      if (error instanceof Error) {
        if (error.message === "AUTHENTICATION_REQUIRED") {
          // For PAT authentication, return clear error message
          if (WIKI_API_TOKEN) {
            return {
              content: [
                {
                  type: "text",
                  text: "AUTHENTICATION_ERROR: Invalid or expired API token. Please check your WIKI_API_TOKEN environment variable.",
                },
              ],
              isError: true,
            };
          }

          // For cookie-based auth, return structured error for sap-auth-mcp
          const httpClient = new PureWikiHttpClient(
            WIKI_DOMAIN,
            WIKI_API_TOKEN,
          );
          await httpClient.initialize();
          const storageInfo = await httpClient.getCookieStorageInfo();

          // Extract directory path from file path
          const storePath = storageInfo.filePath.substring(
            0,
            storageInfo.filePath.lastIndexOf("/"),
          );

          const structuredError = {
            error: "SAP_AUTH_REQUIRED",
            details:
              "Need call SAP auth MCP to prepare cookie and redo function after.",
            data: {
              store_path: storePath,
              entry_url: `https://${WIKI_DOMAIN || "wiki.one.int.sap"}/`,
            },
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(structuredError, null, 2),
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `CONTENT_FETCH_ERROR: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "wiki_update_page") {
    try {
      const { pageId, content, version, title, comment } = WikiUpdatePageSchema.parse(args);

      console.error(`📝 Updating wiki page: ${pageId} (version: ${version})`);

      const httpClient = new PureWikiHttpClient(WIKI_DOMAIN, WIKI_API_TOKEN);
      await httpClient.initialize();

      const startTime = Date.now();
      const result = await httpClient.updatePageContent(
        pageId,
        content,
        version,
        title,
        comment
      );
      const endTime = Date.now();

      console.error(`✅ Page updated in ${endTime - startTime}ms (new version: ${result.newVersion})`);

      return {
        content: [
          {
            type: "text",
            text: `✅ Page updated successfully!

Page ID: ${result.pageId}
Title: ${result.title}
New Version: ${result.newVersion}
URL: ${result.url}`,
          },
        ],
      };
    } catch (error) {
      console.error("❌ Wiki update error:", error);

      if (error instanceof Error) {
        if (error.message === "AUTHENTICATION_REQUIRED") {
          // For PAT authentication, return clear error message
          if (WIKI_API_TOKEN) {
            return {
              content: [
                {
                  type: "text",
                  text: "AUTHENTICATION_ERROR: Invalid or expired API token. Please check your WIKI_API_TOKEN environment variable.",
                },
              ],
              isError: true,
            };
          }

          // For cookie-based auth, return structured error for sap-auth-mcp
          const httpClient = new PureWikiHttpClient(
            WIKI_DOMAIN,
            WIKI_API_TOKEN,
          );
          await httpClient.initialize();
          const storageInfo = await httpClient.getCookieStorageInfo();

          // Extract directory path from file path
          const storePath = storageInfo.filePath.substring(
            0,
            storageInfo.filePath.lastIndexOf("/"),
          );

          const structuredError = {
            error: "SAP_AUTH_REQUIRED",
            details:
              "Need call SAP auth MCP to prepare cookie and redo function after.",
            data: {
              store_path: storePath,
              entry_url: `https://${WIKI_DOMAIN || "wiki.one.int.sap"}/`,
            },
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(structuredError, null, 2),
              },
            ],
            isError: true,
          };
        }

        // Handle specific update errors
        if (error.message.includes("VERSION_CONFLICT")) {
          return {
            content: [
              {
                type: "text",
                text: "VERSION_CONFLICT: The page has been modified by someone else. Please re-read the page with format='storage' to get the latest version and try again.",
              },
            ],
            isError: true,
          };
        }

        if (error.message.includes("ACCESS_FORBIDDEN")) {
          return {
            content: [
              {
                type: "text",
                text: "ACCESS_FORBIDDEN: You don't have permission to edit this page.",
              },
            ],
            isError: true,
          };
        }

        if (error.message.includes("INVALID_CONTENT")) {
          return {
            content: [
              {
                type: "text",
                text: `INVALID_CONTENT: ${error.message}. Make sure the content is valid Confluence storage format.`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `UPDATE_ERROR: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "wiki_create_page") {
    try {
      const { spaceKey, title, content, parentPageId } = WikiCreatePageSchema.parse(args);

      console.error(`📝 Creating wiki page: "${title}" in space ${spaceKey}${parentPageId ? ` (parent: ${parentPageId})` : ''}`);

      const httpClient = new PureWikiHttpClient(WIKI_DOMAIN, WIKI_API_TOKEN);
      await httpClient.initialize();

      const startTime = Date.now();
      const result = await httpClient.createPage(spaceKey, title, content, parentPageId);
      const endTime = Date.now();

      console.error(`✅ Page created in ${endTime - startTime}ms (pageId: ${result.pageId})`);

      return {
        content: [
          {
            type: "text",
            text: `✅ Page created successfully!

Page ID: ${result.pageId}
Title: ${result.title}
Space: ${result.spaceKey}
Version: ${result.version}
URL: ${result.url}`,
          },
        ],
      };
    } catch (error) {
      console.error("❌ Wiki create page error:", error);

      if (error instanceof Error) {
        if (error.message === "AUTHENTICATION_REQUIRED") {
          // For PAT authentication, return clear error message
          if (WIKI_API_TOKEN) {
            return {
              content: [
                {
                  type: "text",
                  text: "AUTHENTICATION_ERROR: Invalid or expired API token. Please check your WIKI_API_TOKEN environment variable.",
                },
              ],
              isError: true,
            };
          }

          // For cookie-based auth, return structured error for sap-auth-mcp
          const httpClient = new PureWikiHttpClient(
            WIKI_DOMAIN,
            WIKI_API_TOKEN,
          );
          await httpClient.initialize();
          const storageInfo = await httpClient.getCookieStorageInfo();

          // Extract directory path from file path
          const storePath = storageInfo.filePath.substring(
            0,
            storageInfo.filePath.lastIndexOf("/"),
          );

          const structuredError = {
            error: "SAP_AUTH_REQUIRED",
            details:
              "Need call SAP auth MCP to prepare cookie and redo function after.",
            data: {
              store_path: storePath,
              entry_url: `https://${WIKI_DOMAIN || "wiki.one.int.sap"}/`,
            },
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(structuredError, null, 2),
              },
            ],
            isError: true,
          };
        }

        // Handle specific create errors
        if (error.message.includes("DUPLICATE_TITLE")) {
          return {
            content: [
              {
                type: "text",
                text: error.message,
              },
            ],
            isError: true,
          };
        }

        if (error.message.includes("ACCESS_FORBIDDEN")) {
          return {
            content: [
              {
                type: "text",
                text: "ACCESS_FORBIDDEN: You don't have permission to create pages in this space.",
              },
            ],
            isError: true,
          };
        }

        if (error.message.includes("SPACE_NOT_FOUND")) {
          return {
            content: [
              {
                type: "text",
                text: error.message,
              },
            ],
            isError: true,
          };
        }

        if (error.message.includes("INVALID_REQUEST")) {
          return {
            content: [
              {
                type: "text",
                text: `${error.message}. Make sure the content is valid Confluence storage format.`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `CREATE_PAGE_ERROR: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "wiki_delete_page") {
    try {
      const { pageId } = WikiDeletePageSchema.parse(args);

      console.error(`🗑️ Deleting wiki page: ${pageId}`);

      const httpClient = new PureWikiHttpClient(WIKI_DOMAIN, WIKI_API_TOKEN);
      await httpClient.initialize();

      const startTime = Date.now();
      const result = await httpClient.deletePage(pageId);
      const endTime = Date.now();

      console.error(`✅ Page deleted in ${endTime - startTime}ms`);

      return {
        content: [
          {
            type: "text",
            text: `✅ Page deleted successfully!

Page ID: ${result.pageId}`,
          },
        ],
      };
    } catch (error) {
      console.error("❌ Wiki delete page error:", error);

      if (error instanceof Error) {
        if (error.message === "AUTHENTICATION_REQUIRED") {
          // For PAT authentication, return clear error message
          if (WIKI_API_TOKEN) {
            return {
              content: [
                {
                  type: "text",
                  text: "AUTHENTICATION_ERROR: Invalid or expired API token. Please check your WIKI_API_TOKEN environment variable.",
                },
              ],
              isError: true,
            };
          }

          // For cookie-based auth, return structured error for sap-auth-mcp
          const httpClient = new PureWikiHttpClient(
            WIKI_DOMAIN,
            WIKI_API_TOKEN,
          );
          await httpClient.initialize();
          const storageInfo = await httpClient.getCookieStorageInfo();

          // Extract directory path from file path
          const storePath = storageInfo.filePath.substring(
            0,
            storageInfo.filePath.lastIndexOf("/"),
          );

          const structuredError = {
            error: "SAP_AUTH_REQUIRED",
            details:
              "Need call SAP auth MCP to prepare cookie and redo function after.",
            data: {
              store_path: storePath,
              entry_url: `https://${WIKI_DOMAIN || "wiki.one.int.sap"}/`,
            },
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(structuredError, null, 2),
              },
            ],
            isError: true,
          };
        }

        // Handle specific delete errors
        if (error.message.includes("PAGE_NOT_FOUND")) {
          return {
            content: [
              {
                type: "text",
                text: error.message,
              },
            ],
            isError: true,
          };
        }

        if (error.message.includes("ACCESS_FORBIDDEN")) {
          return {
            content: [
              {
                type: "text",
                text: "ACCESS_FORBIDDEN: You don't have permission to delete this page.",
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `DELETE_PAGE_ERROR: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (WIKI_DOMAIN && WIKI_API_TOKEN) {
    console.error(
      `🚀 Wiki MCP Server running on stdio (Custom domain: ${WIKI_DOMAIN})`,
    );
  } else {
    console.error("🚀 SAP Wiki MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
