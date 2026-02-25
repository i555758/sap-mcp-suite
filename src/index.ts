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
    version: "1.1.1",
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
        },
        required: ["url"],
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
      const { url, raw = false } = WikiContentSchema.parse(args);

      console.error(`📄 Fetching wiki content from: ${url} (raw: ${raw})`);

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
