import axios, { AxiosError } from "axios";
import {
  AuthManager,
  AuthError,
  AuthExpiredError,
  AuthNotConfiguredError,
} from "@anthropic/sap-auth";

// Custom error for auth redirect detection
class AuthRedirectError extends Error {
  constructor(public redirectUrl: string) {
    super("AUTHENTICATION_REQUIRED");
    this.name = "AuthRedirectError";
  }
}

/**
 * Check if an error is a network connectivity error
 */
function isNetworkError(error: any): boolean {
  return error?.code === "ECONNREFUSED" || error?.code === "ETIMEDOUT";
}

/**
 * Pure HTTP Client for Wiki - No Browser Dependencies
 * Supports both PAT authentication and cookie-based authentication via @anthropic/sap-auth
 * Designed for non-long-running MCP instances
 */
export class PureWikiHttpClient {
  private httpClient: any;
  private authManager: AuthManager;
  private readonly WIKI_DOMAIN: string;
  private readonly BASE_URL: string;
  private readonly apiToken?: string;
  private readonly usePATAuth: boolean;

  constructor(domain?: string, apiToken?: string) {
    this.WIKI_DOMAIN = domain || "wiki.one.int.sap";
    this.BASE_URL = `https://${this.WIKI_DOMAIN}`;
    this.apiToken = apiToken;
    this.usePATAuth = !!apiToken;
    this.authManager = AuthManager.getInstance();

    const headers: any = {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      "cache-control": "no-cache, no-store, must-revalidate",
      dnt: "1",
      expires: "0",
      pragma: "no-cache",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    if (this.usePATAuth) {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
      console.log(`Using PAT authentication for domain: ${this.WIKI_DOMAIN}`);
    } else {
      headers["referer"] = `https://${this.WIKI_DOMAIN}/wiki/`;
      console.log(
        `Using cookie-based authentication for domain: ${this.WIKI_DOMAIN}`,
      );
    }

    this.httpClient = axios.create({
      baseURL: this.BASE_URL,
      timeout: 15000,
      headers,
      maxRedirects: 5,
    });

    // Intercept responses to detect auth redirects
    this.httpClient.interceptors.response.use(
      (response: any) => {
        const finalUrl = response.request?.res?.responseURL || "";
        if (this.isLoginUrl(finalUrl)) {
          console.log(`🔒 Auth redirect detected (final URL): ${finalUrl}`);
          throw new AuthRedirectError(finalUrl);
        }

        // Check response body for JS-based redirects (small HTML page with redirect script)
        if (
          response.status === 200 &&
          response.data &&
          typeof response.data === "string"
        ) {
          const body = response.data;
          const isSmallPage = body.length < 5000;
          const hasJsRedirect =
            body.includes("window.location.assign") &&
            body.includes("accounts.sap.com/saml2/idp/sso");
          if (isSmallPage && hasJsRedirect) {
            console.log(`🔒 Auth redirect detected (JS redirect in body)`);
            throw new AuthRedirectError("accounts.sap.com/saml2/idp/sso");
          }
        }

        return response;
      },
      (error: AxiosError) => {
        if (
          error.response &&
          [301, 302, 303, 307, 308].includes(error.response.status)
        ) {
          const location = (error.response.headers as any)?.location || "";
          if (this.isLoginUrl(location)) {
            console.log(`🔒 Auth redirect detected (location): ${location}`);
            throw new AuthRedirectError(location);
          }
        }
        return Promise.reject(error);
      },
    );
  }

  private isLoginUrl(url: string): boolean {
    if (!url) return false;
    return (
      url.includes("login.action") ||
      url.includes("permissionViolation=true") ||
      url.includes("accounts.sap.com/saml2/idp/sso")
    );
  }

  async initialize(): Promise<{ cookieLoaded: boolean }> {
    if (this.usePATAuth) {
      console.log("PAT authentication enabled, skipping cookie loading");
      return { cookieLoaded: false };
    }
    return await this.loadAuthCredentials();
  }

  async reloadCookies(): Promise<{ cookieLoaded: boolean }> {
    if (this.usePATAuth) {
      return { cookieLoaded: false };
    }
    return await this.loadAuthCredentials();
  }

  /**
   * Load credentials from AuthManager (shared auth package)
   */
  private async loadAuthCredentials(): Promise<{ cookieLoaded: boolean }> {
    try {
      const creds = await this.authManager.getCredentials("wiki");

      if (creds.type === "cookie") {
        this.httpClient.defaults.headers.common["Cookie"] = creds.value;
        console.log("Loaded cookies from shared auth storage");
        return { cookieLoaded: true };
      } else if (creds.type === "bearer") {
        this.httpClient.defaults.headers.common["Authorization"] =
          `Bearer ${creds.value}`;
        console.log("Loaded bearer token from shared auth storage");
        return { cookieLoaded: true };
      }

      return { cookieLoaded: false };
    } catch (error) {
      if (
        error instanceof AuthExpiredError ||
        error instanceof AuthNotConfiguredError
      ) {
        console.log(
          `Authentication required: ${error instanceof AuthExpiredError ? "expired" : "not configured"}`,
        );
        return { cookieLoaded: false };
      }
      if (error instanceof AuthError) {
        console.error("Auth error:", error.message);
        return { cookieLoaded: false };
      }
      console.error("Cookie initialization failed:", error);
      return { cookieLoaded: false };
    }
  }

  /**
   * Execute request with automatic retry on auth failure
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    context: string,
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error: any) {
      // Handle auth redirect error
      if (
        error instanceof AuthRedirectError ||
        error.message === "AUTHENTICATION_REQUIRED"
      ) {
        if (this.usePATAuth) {
          throw new Error("AUTHENTICATION_REQUIRED");
        }

        // Try to reload cookies once
        console.log(
          `🔄 Auth required for ${context}, trying to reload cookies...`,
        );
        const reloadResult = await this.reloadCookies();

        if (reloadResult.cookieLoaded) {
          console.log(`🔄 Retrying ${context} with reloaded cookies...`);
          try {
            return await requestFn();
          } catch (retryError: any) {
            if (
              retryError instanceof AuthRedirectError ||
              retryError.message === "AUTHENTICATION_REQUIRED"
            ) {
              throw new Error("AUTHENTICATION_REQUIRED");
            }
            throw retryError;
          }
        }
        throw new Error("AUTHENTICATION_REQUIRED");
      }

      // Handle 401
      if (error.response?.status === 401) {
        if (this.usePATAuth) {
          throw new Error("AUTHENTICATION_REQUIRED");
        }

        console.log(`🔄 401 error for ${context}, trying to reload cookies...`);
        const reloadResult = await this.reloadCookies();

        if (reloadResult.cookieLoaded) {
          console.log(`🔄 Retrying ${context} with reloaded cookies...`);
          try {
            return await requestFn();
          } catch (retryError: any) {
            // Fall through
          }
        }
        throw new Error("AUTHENTICATION_REQUIRED");
      }

      throw error;
    }
  }

  async cqlSearch(
    cqlQuery: string,
    start: number = 0,
    limit: number = 20,
  ): Promise<any> {
    const encodedCql = encodeURIComponent(cqlQuery);
    const searchPath = `/rest/api/search?cql=${encodedCql}&start=${start}&limit=${limit}&excerpt=highlight&expand=space.icon&includeArchivedSpaces=false&src=next.ui.search`;

    try {
      return await this.executeWithRetry(async () => {
        const response = await this.httpClient.get(searchPath);
        if (response.status === 200 && response.data) {
          return response.data;
        }
        throw new Error(`HTTP ${response.status}: Unexpected response format`);
      }, "CQL search");
    } catch (error: any) {
      if (error.message === "AUTHENTICATION_REQUIRED") {
        throw error;
      }
      if (error.response?.status === 403) {
        throw new Error("ACCESS_FORBIDDEN");
      }
      if (error.response?.status === 400) {
        const errorMsg =
          error.response?.data?.message ||
          error.response?.data ||
          "Invalid CQL query syntax";
        throw new Error(`CQL_SYNTAX_ERROR: ${errorMsg}`);
      }
      if (isNetworkError(error)) {
        throw new Error("NETWORK_ERROR");
      }
      throw new Error(
        `HTTP_ERROR: ${error.response?.status || "Unknown"} - ${error.message}`,
      );
    }
  }

  async searchWiki(
    searchTerm: string,
    start: number = 0,
    limit: number = 20,
  ): Promise<any> {
    const cqlQuery = encodeURIComponent(
      `siteSearch ~ "${searchTerm}" AND type in ("space","user","com.atlassian.confluence.extra.team-calendars:calendar-content-type","attachment","page","com.atlassian.confluence.extra.team-calendars:space-calendars-view-content-type","blogpost")`,
    );
    const searchPath = `/rest/api/search?cql=${cqlQuery}&start=${start}&limit=${limit}&excerpt=highlight&expand=space.icon&includeArchivedSpaces=false&src=next.ui.search`;

    try {
      return await this.executeWithRetry(async () => {
        const response = await this.httpClient.get(searchPath);
        if (response.status === 200 && response.data) {
          return response.data;
        }
        throw new Error(`HTTP ${response.status}: Unexpected response format`);
      }, "wiki search");
    } catch (error: any) {
      if (error.message === "AUTHENTICATION_REQUIRED") {
        throw error;
      }
      if (error.response?.status === 403) {
        throw new Error("ACCESS_FORBIDDEN");
      }
      if (isNetworkError(error)) {
        throw new Error("NETWORK_ERROR");
      }
      throw new Error(`HTTP_ERROR: ${error.response?.status || "Unknown"}`);
    }
  }

  async fetchWikiContent(url: string, raw: boolean = false): Promise<string> {
    if (!url.includes(this.WIKI_DOMAIN)) {
      throw new Error(`Invalid wiki URL domain. Expected: ${this.WIKI_DOMAIN}`);
    }

    const requestOptions = {
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "upgrade-insecure-requests": "1",
      },
    };

    try {
      return await this.executeWithRetry(async () => {
        const response = await this.httpClient.get(url, requestOptions);
        if (response.status === 200 && response.data) {
          return raw ? response.data : this.cleanHtmlContent(response.data);
        }
        throw new Error(
          `HTTP ${response.status}: Failed to fetch page content`,
        );
      }, "content fetch");
    } catch (error: any) {
      if (error.message === "AUTHENTICATION_REQUIRED") {
        throw error;
      }
      if (error.response?.status === 403) {
        throw new Error("ACCESS_FORBIDDEN");
      }
      if (error.response?.status === 404) {
        throw new Error("PAGE_NOT_FOUND");
      }
      if (isNetworkError(error)) {
        throw new Error("NETWORK_ERROR");
      }
      throw new Error(`CONTENT_FETCH_ERROR: ${error.message}`);
    }
  }

  private cleanHtmlContent(html: string): string {
    try {
      const mainContentStart = html.indexOf('<div id="main-content"');
      if (mainContentStart === -1) {
        console.warn("Warning: div#main-content not found in page");
        return "Error: Could not find main content section (div#main-content) in the page.";
      }

      const endMarker = '<div id="likes-and-labels-container"';
      let endPosition = html.indexOf(endMarker, mainContentStart);
      if (endPosition === -1) {
        console.warn(
          "Warning: div#likes-and-labels-container not found, extracting all main-content",
        );
        endPosition = html.length;
      }

      let content = html.substring(mainContentStart, endPosition);

      // Remove script and style tags
      content = content.replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        "",
      );
      content = content.replace(
        /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
        "",
      );

      // Convert HTML to text
      content = content.replace(/<br\s*\/?>/gi, "\n");
      content = content.replace(
        /<\/?(div|p|h[1-6]|li|ul|ol|table|tr|td|th)[^>]*>/gi,
        "\n",
      );
      content = content.replace(/<[^>]+>/g, "");

      // Decode HTML entities
      content = content
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&hellip;/g, "...")
        .replace(/&ndash;/g, "-")
        .replace(/&mdash;/g, "—")
        .replace(/&apos;/g, "'");

      // Clean whitespace
      content = content
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return content;
    } catch (error) {
      console.error("HTML cleaning error:", error);
      return `Error extracting content: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async getCookieStorageInfo(): Promise<any> {
    if (this.usePATAuth) {
      return {
        exists: false,
        cookieCount: 0,
        filePath: "N/A (using PAT authentication)",
      };
    }

    try {
      const status = await this.authManager.getStatus("wiki");
      return {
        exists: status.configured,
        valid: status.valid,
        filePath: this.authManager.getStoragePath(),
        expiresAt: status.expiresAt,
        expiresInMinutes: status.expiresInMinutes,
      };
    } catch (error) {
      return {
        exists: false,
        valid: false,
        filePath: this.authManager.getStoragePath(),
      };
    }
  }

  isUsingPATAuth(): boolean {
    return this.usePATAuth;
  }

  getWikiDomain(): string {
    return this.WIKI_DOMAIN;
  }

  /**
   * Get page content in storage format (for editing)
   * Returns the Confluence storage XML, version number, and page metadata
   */
  async getPageStorageFormat(pageId: string): Promise<{
    pageId: string;
    title: string;
    version: number;
    content: string;
    spaceKey: string;
  }> {
    const apiPath = `/wiki/rest/api/content/${pageId}?expand=body.storage,version,space`;

    try {
      return await this.executeWithRetry(async () => {
        const response = await this.httpClient.get(apiPath);
        if (response.status === 200 && response.data) {
          const data = response.data;
          return {
            pageId: data.id,
            title: data.title,
            version: data.version.number,
            content: data.body.storage.value,
            spaceKey: data.space?.key || '',
          };
        }
        throw new Error(`HTTP ${response.status}: Unexpected response format`);
      }, "get page storage format");
    } catch (error: any) {
      if (error.message === "AUTHENTICATION_REQUIRED") {
        throw error;
      }
      if (error.response?.status === 404) {
        throw new Error("PAGE_NOT_FOUND");
      }
      if (error.response?.status === 403) {
        throw new Error("ACCESS_FORBIDDEN");
      }
      if (isNetworkError(error)) {
        throw new Error("NETWORK_ERROR");
      }
      throw new Error(`GET_PAGE_ERROR: ${error.message}`);
    }
  }

  /**
   * Update page content
   * Requires the current version number to prevent conflicts
   */
  async updatePageContent(
    pageId: string,
    content: string,
    currentVersion: number,
    title?: string,
    comment?: string
  ): Promise<{
    pageId: string;
    title: string;
    newVersion: number;
    url: string;
  }> {
    const apiPath = `/wiki/rest/api/content/${pageId}`;

    // First get the current page to get title if not provided
    let pageTitle = title;
    if (!pageTitle) {
      const currentPage = await this.getPageStorageFormat(pageId);
      pageTitle = currentPage.title;
    }

    const payload: any = {
      id: pageId,
      type: "page",
      title: pageTitle,
      version: {
        number: currentVersion + 1,
        message: comment || "",
      },
      body: {
        storage: {
          value: content,
          representation: "storage",
        },
      },
    };

    try {
      return await this.executeWithRetry(async () => {
        const response = await this.httpClient.put(apiPath, payload, {
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (response.status === 200 && response.data) {
          const data = response.data;
          return {
            pageId: data.id,
            title: data.title,
            newVersion: data.version.number,
            url: `https://${this.WIKI_DOMAIN}${data._links?.webui || `/wiki/pages/viewpage.action?pageId=${pageId}`}`,
          };
        }
        throw new Error(`HTTP ${response.status}: Unexpected response format`);
      }, "update page content");
    } catch (error: any) {
      if (error.message === "AUTHENTICATION_REQUIRED") {
        throw error;
      }
      if (error.response?.status === 404) {
        throw new Error("PAGE_NOT_FOUND");
      }
      if (error.response?.status === 403) {
        throw new Error("ACCESS_FORBIDDEN: You don't have permission to edit this page");
      }
      if (error.response?.status === 409) {
        throw new Error("VERSION_CONFLICT: The page has been modified. Please re-read the page and try again.");
      }
      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.message || "Invalid content format";
        throw new Error(`INVALID_CONTENT: ${errorMsg}`);
      }
      if (isNetworkError(error)) {
        throw new Error("NETWORK_ERROR");
      }
      throw new Error(`UPDATE_PAGE_ERROR: ${error.message}`);
    }
  }

  /**
   * Create a new wiki page
   * @param spaceKey - The space key where the page will be created (e.g., 'BDCCatBR')
   * @param title - The title of the new page
   * @param content - The page content in Confluence storage format (XML)
   * @param parentPageId - Optional parent page ID. If provided, creates the page as a child of this page
   */
  async createPage(
    spaceKey: string,
    title: string,
    content: string,
    parentPageId?: string
  ): Promise<{
    pageId: string;
    title: string;
    version: number;
    url: string;
    spaceKey: string;
  }> {
    const apiPath = `/wiki/rest/api/content`;

    const payload: any = {
      type: "page",
      title: title,
      space: {
        key: spaceKey,
      },
      body: {
        storage: {
          value: content,
          representation: "storage",
        },
      },
    };

    // Add parent page (ancestors) if provided
    if (parentPageId) {
      payload.ancestors = [{ id: parentPageId }];
    }

    try {
      return await this.executeWithRetry(async () => {
        const response = await this.httpClient.post(apiPath, payload, {
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (response.status === 200 || response.status === 201) {
          const data = response.data;
          return {
            pageId: data.id,
            title: data.title,
            version: data.version?.number || 1,
            url: `https://${this.WIKI_DOMAIN}${data._links?.webui || `/wiki/pages/viewpage.action?pageId=${data.id}`}`,
            spaceKey: data.space?.key || spaceKey,
          };
        }
        throw new Error(`HTTP ${response.status}: Unexpected response format`);
      }, "create page");
    } catch (error: any) {
      if (error.message === "AUTHENTICATION_REQUIRED") {
        throw error;
      }
      if (error.response?.status === 403) {
        throw new Error("ACCESS_FORBIDDEN: You don't have permission to create pages in this space");
      }
      if (error.response?.status === 400) {
        const errorMsg = error.response?.data?.message || "Invalid request";
        // Check for duplicate title error
        if (errorMsg.includes("A page with this title already exists")) {
          throw new Error(`DUPLICATE_TITLE: A page with the title "${title}" already exists in this space`);
        }
        throw new Error(`INVALID_REQUEST: ${errorMsg}`);
      }
      if (error.response?.status === 404) {
        throw new Error(`SPACE_NOT_FOUND: Space "${spaceKey}" does not exist or you don't have access to it`);
      }
      if (isNetworkError(error)) {
        throw new Error("NETWORK_ERROR");
      }
      throw new Error(`CREATE_PAGE_ERROR: ${error.message}`);
    }
  }

  /**
   * Delete a wiki page
   * @param pageId - The page ID to delete
   */
  async deletePage(pageId: string): Promise<{ success: boolean; pageId: string }> {
    const apiPath = `/wiki/rest/api/content/${pageId}`;

    try {
      return await this.executeWithRetry(async () => {
        const response = await this.httpClient.delete(apiPath);
        // 204 No Content is the success response for DELETE
        if (response.status === 204 || response.status === 200) {
          return {
            success: true,
            pageId: pageId,
          };
        }
        throw new Error(`HTTP ${response.status}: Unexpected response`);
      }, "delete page");
    } catch (error: any) {
      if (error.message === "AUTHENTICATION_REQUIRED") {
        throw error;
      }
      if (error.response?.status === 403) {
        throw new Error("ACCESS_FORBIDDEN: You don't have permission to delete this page");
      }
      if (error.response?.status === 404) {
        throw new Error(`PAGE_NOT_FOUND: Page "${pageId}" does not exist`);
      }
      if (isNetworkError(error)) {
        throw new Error("NETWORK_ERROR");
      }
      throw new Error(`DELETE_PAGE_ERROR: ${error.message}`);
    }
  }
}
