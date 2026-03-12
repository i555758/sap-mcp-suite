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
  ProviderRegistry,
  credentialsToHeaders,
  makeBrowserRequest,
} from "sap-auth";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { McpResponse } from "mcp-utils";

/**
 * Handle sap_authenticate tool
 */
export async function handleAuthenticate(
  auth: AuthManager,
  args: Record<string, unknown> | undefined,
): Promise<McpResponse> {
  const entryUrl = args?.entry_url as string;
  const token = args?.token as string | undefined;

  if (!entryUrl) {
    throw new McpError(ErrorCode.InvalidRequest, "entry_url is required");
  }

  // Map URL to provider ID
  const providerId = ProviderRegistry.resolveByUrl(entryUrl);
  if (!providerId) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Unknown SAP system URL: ${entryUrl}. Supported: wiki.one.int.sap, jira.tools.sap, teams.microsoft.com, github.tools.sap, github.wdf.sap.corp`,
    );
  }

  // If token is provided directly, store it as an API token (no browser needed)
  if (token) {
    await auth.setApiToken(providerId, token);
    return {
      content: [
        {
          type: "text",
          text:
            `Successfully stored API token for ${providerId} (${entryUrl})\n` +
            `Credential type: api-token\n` +
            `Storage: ${auth.getStoragePath()}`,
        },
      ],
    };
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
            text:
              `API token required for ${providerId}.\n\n` +
              `${error.instructions}\n\n` +
              `Once you have the token, store it by calling:\n` +
              `sap_authenticate({ entry_url: "${entryUrl}", token: "YOUR_TOKEN" })`,
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
  const providerId = ProviderRegistry.resolveByUrl(url as string);

  // No known provider — fall back to browser-based request
  if (!providerId) {
    return await handleBrowserRequest(
      url as string,
      method as string,
      headers as Record<string, string>,
      body,
    );
  }

  try {
    // Get credentials for this provider
    const credentials = await auth.getCredentials(providerId);

    // Build request headers
    const authHeaders = credentialsToHeaders(credentials);
    const requestHeaders: Record<string, string> = {
      ...(headers as Record<string, string>),
      ...authHeaders,
    };

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
 * Make an HTTP request via headless browser.
 * Used when the URL doesn't match any known provider — the browser's
 * system credentials (Kerberos/keychain) handle authentication automatically.
 */
async function handleBrowserRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<McpResponse> {
  try {
    const response = await makeBrowserRequest(url, {
      method,
      headers,
      body,
    });

    let responseData: unknown;
    try {
      responseData = JSON.parse(response.body);
    } catch {
      responseData = response.body;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              data: responseData,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Browser request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
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
 * Handle sap_clear_auths tool
 */
export async function handleClearAuths(
  auth: AuthManager,
  args: Record<string, unknown> | undefined,
): Promise<McpResponse> {
  const provider = (args?.provider as string) || "all";
  const includePats = (args?.include_pats as boolean) || false;

  const statuses = await auth.listProviders();
  const cleared: string[] = [];
  const skipped: string[] = [];

  const toClear = provider === "all"
    ? statuses
    : statuses.filter((s) => s.providerId === provider);

  if (provider !== "all" && toClear.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `Provider "${provider}" not found. Available: ${statuses.map((s) => s.providerId).join(", ")}`,
        },
      ],
    };
  }

  for (const status of toClear) {
    if (!status.method) continue; // no stored auth

    if (status.method === "api-token" && !includePats) {
      skipped.push(`${status.providerId} (PAT protected — use include_pats to clear)`);
      continue;
    }

    await auth.clearAuth(status.providerId);
    cleared.push(`${status.providerId} (${status.method})`);
  }

  const lines: string[] = [];
  if (cleared.length > 0) {
    lines.push(`Cleared: ${cleared.join(", ")}`);
  }
  if (skipped.length > 0) {
    lines.push(`Skipped: ${skipped.join(", ")}`);
  }
  if (cleared.length === 0 && skipped.length === 0) {
    lines.push("Nothing to clear — no stored credentials found.");
  }

  return {
    content: [
      {
        type: "text",
        text: lines.join("\n"),
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
        token: z.string().optional().describe(
          "Optional: API token/PAT to store directly without launching a browser. Use for systems requiring Personal Access Tokens (e.g., GitHub, Jira).",
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

  // sap_clear_auths tool
  server.registerTool(
    "sap_clear_auths",
    {
      title: "SAP Clear Auth",
      description: "Clear stored authentication credentials",
      inputSchema: {
        provider: z.string().optional().describe(
          'Provider to clear (e.g., "wiki", "jira", "teams", "github-wdf", "github-tools"). Defaults to "all".',
        ),
        include_pats: z.boolean().optional().describe(
          "Also clear PATs (Personal Access Tokens). PATs are protected by default since they require manual regeneration.",
        ),
      },
    },
    async (args) => {
      return await handleClearAuths(auth, args);
    },
  );
}
