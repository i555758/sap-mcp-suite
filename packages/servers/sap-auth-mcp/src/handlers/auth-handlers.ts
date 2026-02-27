/**
 * Authentication tool handlers for SAP Auth MCP
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AuthManager,
  AuthError,
  AuthBrowserError,
  ApiTokenRequiredError,
} from "sap-auth";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { McpResponse } from "mcp-utils";

/**
 * Map URL to provider ID
 */
export function urlToProviderId(url: string): string | null {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes("wiki.one.int.sap") || lowerUrl.includes("wiki")) {
    return "wiki";
  }
  if (lowerUrl.includes("jira.tools.sap") || lowerUrl.includes("jira")) {
    return "jira";
  }
  if (
    lowerUrl.includes("teams.microsoft.com") ||
    lowerUrl.includes("teams.cloud.microsoft") ||
    lowerUrl.includes("teams")
  ) {
    return "teams";
  }
  if (lowerUrl.includes("graph.microsoft.com") || lowerUrl.includes("graph")) {
    return "graph";
  }

  return null;
}

/**
 * Handle sap_authenticate tool
 */
export async function handleAuthenticate(
  auth: AuthManager,
  args: Record<string, unknown> | undefined,
): Promise<McpResponse> {
  const entryUrl = args?.entry_url as string;

  if (!entryUrl) {
    throw new McpError(ErrorCode.InvalidRequest, "entry_url is required");
  }

  // Map URL to provider ID
  const providerId = urlToProviderId(entryUrl);
  if (!providerId) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Unknown SAP system URL: ${entryUrl}. Supported: wiki.one.int.sap, jira.tools.sap, teams.microsoft.com`,
    );
  }

  try {
    // Force re-authentication
    const credentials = await auth.forceReauth(providerId);

    return {
      content: [
        {
          type: "text",
          text:
            `Successfully authenticated with ${providerId} (${entryUrl})\n` +
            `Credential type: ${credentials.type}\n` +
            `Expires: ${credentials.expiresAt ? credentials.expiresAt.toISOString() : "N/A"}\n` +
            `Storage: ${auth.getStoragePath()}`,
        },
      ],
    };
  } catch (error) {
    if (error instanceof AuthBrowserError) {
      return {
        content: [
          {
            type: "text",
            text: `Authentication failed for ${providerId}: ${error.message}`,
          },
        ],
      };
    }
    if (error instanceof ApiTokenRequiredError) {
      return {
        content: [
          {
            type: "text",
            text: `API token required for ${providerId}:\n${error.instructions}`,
          },
        ],
      };
    }
    throw error;
  }
}

/**
 * Handle sap_make_request tool
 */
export async function handleMakeRequest(
  auth: AuthManager,
  args: Record<string, unknown> | undefined,
): Promise<McpResponse> {
  const { url, method = "GET", headers = {}, body } = args || {};

  if (!url) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "URL is required for sap_make_request",
    );
  }

  // Determine provider from URL
  const providerId = urlToProviderId(url as string);
  if (!providerId) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Cannot determine provider for URL: ${url}`,
    );
  }

  try {
    // Get credentials for this provider
    const credentials = await auth.getCredentials(providerId);

    // Build request headers
    const requestHeaders: Record<string, string> = {
      ...(headers as Record<string, string>),
    };

    if (credentials.type === "cookie") {
      requestHeaders["Cookie"] = credentials.value;
    } else if (
      credentials.type === "bearer" ||
      credentials.type === "api-token"
    ) {
      requestHeaders["Authorization"] = `Bearer ${credentials.value}`;
    }

    // Make the request
    const fetchOptions: RequestInit = {
      method: method as string,
      headers: requestHeaders,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(body);
      requestHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(url as string, fetchOptions);
    const responseText = await response.text();

    let responseData: unknown;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              data: responseData,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    if (error instanceof AuthError) {
      throw new McpError(
        ErrorCode.InternalError,
        `Authentication error: ${error.message}. Please run sap_authenticate first.`,
      );
    }
    throw error;
  }
}

/**
 * Handle sap_get_cookie_info tool
 */
export async function handleGetCookieInfo(
  auth: AuthManager,
): Promise<McpResponse> {
  const statuses = await auth.listProviders();
  const storagePath = auth.getStoragePath();

  const result = {
    storagePath,
    providers: statuses.map((status) => ({
      providerId: status.providerId,
      configured: status.configured,
      valid: status.valid,
      method: status.method,
      expiresAt: status.expiresAt?.toISOString() || null,
      expiresInMinutes: status.expiresInMinutes,
    })),
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Handle sap_clear_cookies tool
 */
export async function handleClearCookies(
  auth: AuthManager,
): Promise<McpResponse> {
  await auth.clearAll();

  return {
    content: [
      {
        type: "text",
        text: `Cleared all stored authentication credentials from: ${auth.getStoragePath()}`,
      },
    ],
  };
}

/**
 * Register all authentication-related tools
 */
export function registerAuthHandlers(server: McpServer, auth: AuthManager): void {
  // sap_authenticate tool
  server.registerTool(
    "sap_authenticate",
    {
      title: "SAP Authenticate",
      description:
        "Authenticate with SAP systems using hybrid headless/visible Chrome approach",
      inputSchema: {
        entry_url: z.string().describe(
          "SAP system entry URL (e.g., https://jira.tools.sap/, https://wiki.one.int.sap/)",
        ),
      },
    },
    async (args) => {
      return await handleAuthenticate(auth, args);
    },
  );

  // sap_make_request tool
  server.registerTool(
    "sap_make_request",
    {
      title: "SAP Make Request",
      description:
        "Make authenticated HTTP requests to SAP systems. Search for dedicated MCPs before using.",
      inputSchema: {
        url: z.string().describe("URL to make request to"),
        method: z
          .string()
          .optional()
          .default("GET")
          .describe("HTTP method (GET, POST, etc.)"),
        headers: z
          .any()
          .optional()
          .describe("Additional headers to send"),
        body: z
          .any()
          .optional()
          .describe("Request body for POST/PUT requests"),
      },
    },
    async (args) => {
      return await handleMakeRequest(auth, args);
    },
  );

  // sap_get_cookie_info tool
  server.registerTool(
    "sap_get_cookie_info",
    {
      title: "SAP Get Cookie Info",
      description: "Get information about stored authentication credentials",
      inputSchema: {},
    },
    async () => {
      return await handleGetCookieInfo(auth);
    },
  );

  // sap_clear_cookies tool
  server.registerTool(
    "sap_clear_cookies",
    {
      title: "SAP Clear Cookies",
      description: "Clear stored authentication credentials",
      inputSchema: {},
    },
    async () => {
      return await handleClearCookies(auth);
    },
  );
}
