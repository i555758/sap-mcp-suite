/**
 * Search handlers for SAP Wiki MCP
 * Handles: general_search, cql_search, cql_examples
 */
import { z } from "zod";
import { textResponse, textError, extractErrorMessage, wrapToolHandler } from "mcp-utils";
import { isAuthError } from "sap-auth";
import { WikiHttpClient } from "../api/wiki-client.js";
import type { WikiHandlerContext, AuthErrorHandler } from "./types.js";

// Schema for general_search tool
export const GeneralSearchSchema = z.object({
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
export const CqlSearchSchema = z.object({
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

/**
 * Handle general_search tool
 */
export async function handleGeneralSearch(
  args: unknown,
  client: WikiHttpClient,
  _apiToken?: string,
  authErrorHandler?: AuthErrorHandler
) {
  try {
    const {
      keyword,
      start = 0,
      limit = 20,
    } = GeneralSearchSchema.parse(args);
    const validatedLimit = Math.min(Math.max(1, limit), 100);

    console.error(
      `Search request: "${keyword}" (start: ${start}, limit: ${validatedLimit})`,
    );

    const startTime = Date.now();
    const searchResponse = await client.searchWiki(
      keyword,
      start,
      validatedLimit,
    );
    const endTime = Date.now();

    console.error(`Search completed in ${endTime - startTime}ms`);

    // Return search results directly
    const totalResults = searchResponse.totalSize || 0;
    const results = searchResponse.results || [];
    const formattedOutput =
      `Found ${totalResults} results for "${keyword}"\n\n` +
      results
        .slice(0, validatedLimit)
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

    return textResponse(formattedOutput);
  } catch (error) {
    console.error("Search error:", error);

    if (isAuthError(error) && authErrorHandler) {
      return await authErrorHandler(error);
    }

    if (error instanceof Error) {
      if (error.message === "NETWORK_ERROR") {
        return textError("NETWORK_ERROR: Cannot connect to SAP Wiki. Check network connectivity.");
      }
    }

    return textError(`SEARCH_ERROR: ${extractErrorMessage(error)}`);
  }
}

/**
 * Handle cql_examples tool
 */
export async function handleCqlExamples() {
  try {
    console.error("Fetching CQL examples...");

    // Read the CQL examples file
    const { readFileSync } = await import("fs");
    const { join, dirname } = await import("path");
    const { fileURLToPath } = await import("url");

    const currentFileUrl = import.meta.url;
    const currentFilePath = fileURLToPath(currentFileUrl);
    const currentDir = dirname(currentFilePath);

    // Look for the file in handlers directory, then in dist root, then in src
    let examplesContent: string | null = null;

    // Try multiple locations
    const pathsToTry = [
      join(currentDir, "..", "cql_examples.md"),          // dist/cql_examples.md (from dist/handlers)
      join(currentDir, "cql_examples.md"),                // dist/handlers/cql_examples.md
      join(dirname(currentDir), "src", "cql_examples.md"), // src/cql_examples.md
    ];

    for (const path of pathsToTry) {
      try {
        examplesContent = readFileSync(path, "utf8");
        break;
      } catch {
        // Try next path
      }
    }

    if (!examplesContent) {
      throw new Error("Could not find cql_examples.md file");
    }

    console.error("CQL examples loaded successfully");

    return textResponse(examplesContent);
  } catch (error) {
    console.error("CQL examples fetch error:", error);
    return textError(`CQL_EXAMPLES_ERROR: ${extractErrorMessage(error)}`);
  }
}

/**
 * Handle cql_search tool
 */
export async function handleCqlSearch(
  args: unknown,
  client: WikiHttpClient,
  _apiToken?: string,
  authErrorHandler?: AuthErrorHandler
) {
  try {
    const { cql, start = 0, limit = 20 } = CqlSearchSchema.parse(args);

    // Validate limit
    const validatedLimit = Math.min(Math.max(1, limit), 100);

    console.error(
      `CQL search request: "${cql}" (start: ${start}, limit: ${validatedLimit})`,
    );

    const startTime = Date.now();
    const searchResponse = await client.cqlSearch(
      cql,
      start,
      validatedLimit,
    );
    const endTime = Date.now();

    console.error(`CQL search completed in ${endTime - startTime}ms`);

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

    return textResponse(formattedOutput);
  } catch (error) {
    console.error("CQL search error:", error);

    if (isAuthError(error) && authErrorHandler) {
      return await authErrorHandler(error);
    }

    if (error instanceof Error) {
      if (error.message === "NETWORK_ERROR") {
        return textError("NETWORK_ERROR: Cannot connect to SAP Wiki. Check network connectivity.");
      }
      if (error.message.includes("CQL query cannot be empty")) {
        return textError("CQL_ERROR: CQL query cannot be empty. Please provide a valid CQL query.");
      }
      if (error.message.includes("CQL_SYNTAX_ERROR")) {
        return textError(`CQL_SYNTAX_ERROR: ${error.message.replace("CQL_SYNTAX_ERROR: ", "")}. This Confluence instance may not fully support CQL queries. Try using general_search instead for keyword-based search.`);
      }
    }

    return textError(`CQL_SEARCH_ERROR: ${extractErrorMessage(error)}`);
  }
}

/**
 * Register all search-related tools
 */
export function registerSearchHandlers(context: WikiHandlerContext): void {
  const { server, getHttpClient, apiToken, authErrorHandler } = context;

  const errorOptions = {
    isAuthError,
    onAuthError: (error: unknown) => authErrorHandler(error),
  };

  // general_search tool
  server.registerTool(
    "general_search",
    {
      title: "General Search",
      description:
        "Search the SAP Wiki for content using a keyword or phrase. If authentication is required, will return an error asking to run authenticate tool first.",
      inputSchema: {
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
      },
    },
    wrapToolHandler(
      async (args: any) => {
        const client = await getHttpClient();
        return await handleGeneralSearch(args, client, apiToken, authErrorHandler);
      },
      errorOptions
    )
  );

  // cql_examples tool
  server.registerTool(
    "cql_examples",
    {
      title: "CQL Examples",
      description:
        "Get practical CQL query examples with syntax reference for SAP Wiki. Provides verified working CQL examples and syntax rules. TIP: Always use this tool first before constructing CQL queries to understand the correct syntax.",
      inputSchema: {},
    },
    wrapToolHandler(
      async () => handleCqlExamples(),
      errorOptions
    )
  );

  // cql_search tool
  server.registerTool(
    "cql_search",
    {
      title: "CQL Search",
      description:
        "Search SAP Wiki using full CQL (Confluence Query Language) queries. Supports advanced filtering, sorting, and all standard CQL functions. TIP: For effective CQL usage, run cql_examples first to get current SAP Wiki CQL syntax and ready-to-use query examples.",
      inputSchema: {
        cql: z
          .string()
          .describe(
            'Full CQL (Confluence Query Language) query string. Examples: "siteSearch ~ \\"keyword\\" AND type in (\\"page\\", \\"blogpost\\")", "space = \\"SPACEKEY\\" AND title ~ \\"search term\\""'
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
      },
    },
    wrapToolHandler(
      async (args: any) => {
        const client = await getHttpClient();
        return await handleCqlSearch(args, client, apiToken, authErrorHandler);
      },
      errorOptions
    )
  );
}
