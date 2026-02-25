/**
 * Microsoft Graph API Client for SAP MS Teams MCP
 *
 * Handles interactions with Microsoft Graph API for:
 * - People search
 * - Calendar events
 * - Organization chart (manager)
 * - User profiles
 */

import { TeamsAuthManager } from "./auth.js";
import { createLogger } from "./logger.js";
import type { GraphPerson, GraphCalendarEvent, GraphUser } from "./types.js";

const log = createLogger("graph-api");

// ============================================================================
// Constants
// ============================================================================

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

// ============================================================================
// Graph API Client Class
// ============================================================================

export class GraphApiClient {
  private authManager: TeamsAuthManager;

  constructor(authManager: TeamsAuthManager) {
    this.authManager = authManager;
  }

  /**
   * Check if Graph API is available (token exists)
   */
  isAvailable(): boolean {
    return this.authManager.hasGraphToken();
  }

  /**
   * Make an authenticated Graph API request
   */
  private async graphRequest<T = any>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const token = this.authManager.getGraphToken();
    if (!token) {
      throw new Error(
        "Graph API token not available. Please re-authenticate with Teams using sap-auth-mcp.",
      );
    }

    const url = endpoint.startsWith("http")
      ? endpoint
      : `${GRAPH_API_BASE}${endpoint}`;

    log.debug(`Graph API request: ${options.method || "GET"} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      log.debug(`Graph API error ${response.status}: ${text}`);
      throw new Error(`Graph API error ${response.status}: ${text}`);
    }

    log.debug(`Graph API response: ${response.status}`);
    return response.json() as Promise<T>;
  }

  // ==========================================================================
  // People Search Methods
  // ==========================================================================

  /**
   * Search for people by name, email, or other attributes
   * Uses the /me/people endpoint which returns relevant contacts
   */
  async searchPeople(
    query: string,
    limit: number = 10,
  ): Promise<GraphPerson[]> {
    const data = await this.graphRequest<{ value: any[] }>(
      `/me/people?$search="${encodeURIComponent(query)}"&$top=${limit}`,
    );

    return (data.value ?? []).map((p: any) => ({
      id: p.id,
      displayName: p.displayName,
      givenName: p.givenName,
      surname: p.surname,
      emailAddresses: p.scoredEmailAddresses?.map((e: any) => ({
        address: e.address,
        rank: e.relevanceScore,
      })),
      phones: p.phones?.map((ph: any) => ({
        type: ph.type,
        number: ph.number,
      })),
      department: p.department,
      jobTitle: p.jobTitle,
      officeLocation: p.officeLocation,
      companyName: p.companyName,
      userPrincipalName: p.userPrincipalName,
    }));
  }

  // ==========================================================================
  // Calendar Methods
  // ==========================================================================

  /**
   * Get calendar events within a time range
   */
  async getCalendarEvents(
    startDateTime: Date,
    endDateTime: Date,
    limit: number = 50,
  ): Promise<GraphCalendarEvent[]> {
    const startStr = startDateTime.toISOString();
    const endStr = endDateTime.toISOString();

    const data = await this.graphRequest<{ value: any[] }>(
      `/me/calendarView?startDateTime=${startStr}&endDateTime=${endStr}&$top=${limit}&$orderby=start/dateTime`,
    );

    return (data.value ?? []).map((e: any) => ({
      id: e.id,
      subject: e.subject,
      start: e.start,
      end: e.end,
      organizer: e.organizer,
      attendees: e.attendees,
      location: e.location,
      isOnlineMeeting: e.isOnlineMeeting,
      onlineMeetingUrl: e.onlineMeeting?.joinUrl || e.onlineMeetingUrl,
      bodyPreview: e.bodyPreview,
      webLink: e.webLink,
    }));
  }

  /**
   * Get calendar events for today
   */
  async getTodayEvents(limit: number = 20): Promise<GraphCalendarEvent[]> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.getCalendarEvents(start, end, limit);
  }

  /**
   * Get calendar events for this week
   */
  async getWeekEvents(limit: number = 50): Promise<GraphCalendarEvent[]> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return this.getCalendarEvents(start, end, limit);
  }

  /**
   * Get calendar events for this month
   */
  async getMonthEvents(limit: number = 100): Promise<GraphCalendarEvent[]> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return this.getCalendarEvents(start, end, limit);
  }

  // ==========================================================================
  // Organization Chart Methods
  // ==========================================================================

  /**
   * Get current user's manager
   */
  async getManager(): Promise<GraphUser | null> {
    try {
      const data = await this.graphRequest<any>(`/me/manager`);
      return {
        id: data.id,
        displayName: data.displayName,
        givenName: data.givenName,
        surname: data.surname,
        mail: data.mail,
        userPrincipalName: data.userPrincipalName,
        jobTitle: data.jobTitle,
        department: data.department,
        officeLocation: data.officeLocation,
        mobilePhone: data.mobilePhone,
        businessPhones: data.businessPhones,
      };
    } catch (e: any) {
      if (e.message?.includes("404")) {
        return null; // No manager found
      }
      throw e;
    }
  }

  /**
   * Get current user's direct reports
   */
  async getDirectReports(limit: number = 50): Promise<GraphUser[]> {
    try {
      const data = await this.graphRequest<{ value: any[] }>(
        `/me/directReports?$top=${limit}`,
      );
      return (data.value ?? []).map((u: any) => ({
        id: u.id,
        displayName: u.displayName,
        givenName: u.givenName,
        surname: u.surname,
        mail: u.mail,
        userPrincipalName: u.userPrincipalName,
        jobTitle: u.jobTitle,
        department: u.department,
        officeLocation: u.officeLocation,
        mobilePhone: u.mobilePhone,
        businessPhones: u.businessPhones,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get current user's profile
   */
  async getMe(): Promise<GraphUser> {
    const data = await this.graphRequest<any>(`/me`);
    return {
      id: data.id,
      displayName: data.displayName,
      givenName: data.givenName,
      surname: data.surname,
      mail: data.mail,
      userPrincipalName: data.userPrincipalName,
      jobTitle: data.jobTitle,
      department: data.department,
      officeLocation: data.officeLocation,
      mobilePhone: data.mobilePhone,
      businessPhones: data.businessPhones,
    };
  }
}

export default GraphApiClient;
