/**
 * Teams API Client for SAP MS Teams MCP
 *
 * Handles all API interactions with Microsoft Teams.
 */

import { AuthError } from "sap-auth";
import { stripHtml } from "mcp-utils";
import { TeamsAuthManager } from "../services/auth.js";
import { GraphApiClient } from "./graph-api.js";
import { createLogger } from "../logger.js";
import type {
  Conversation,
  Message,
  ConversationListOptions,
  MessageListOptions,
  MeetingRecording,
  TranscriptResult,
  TranscriptSegment,
  ConversationsApiResponse,
  MessagesApiResponse,
  FindPrivateChatResult,
  PrivateChatCandidate,
} from "../types.js";

const log = createLogger("teams-api");

// ============================================================================
// Constants
// ============================================================================

export type MessageFormat = "html" | "markdown";

const MAX_RETRY_ATTEMPTS = 2;
const MESSAGE_PREVIEW_LENGTH = 100;
const RECORDING_PREVIEW_LENGTH = 200;
const MAX_FETCH_LIMIT = 200;

// ============================================================================
// Types for internal use
// ============================================================================

export interface ConversationMember {
  id: string;
  odataId: string;
  displayName?: string;
  email?: string;
  role: string;
  joinedAt?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract user IDs from a private chat conversation ID
 * Format: 19:{userId1}_{userId2}@unq.gbl.spaces
 */
function extractUserIdsFromConversationId(conversationId: string): string[] | null {
  // Match pattern: 19:{guid}_{guid}@unq.gbl.spaces
  const match = conversationId.match(
    /^19:([a-f0-9-]+)_([a-f0-9-]+)@unq\.gbl\.spaces$/i
  );
  if (match) {
    return [match[1], match[2]];
  }
  return null;
}

/**
 * Construct a private chat conversation ID from two user IDs
 */
function constructPrivateChatId(userId1: string, userId2: string): string {
  return `19:${userId1}_${userId2}@unq.gbl.spaces`;
}

/**
 * Check if a string is a valid GUID format
 * Teams conversation IDs use GUIDs, not other ID formats
 */
function isValidGuid(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
}

/**
 * Parse time string to Date
 */
function parseTime(timeStr: string | undefined): Date | null {
  if (!timeStr) return null;
  try {
    return new Date(timeStr);
  } catch {
    return null;
  }
}

// ============================================================================
// Teams API Client Class
// ============================================================================

export class TeamsApiClient {
  private authManager: TeamsAuthManager;
  private graphClient: GraphApiClient;
  private apiBase: string;
  private myUserId: string | null = null;

  constructor(authManager: TeamsAuthManager, graphClient: GraphApiClient) {
    this.authManager = authManager;
    this.graphClient = graphClient;
    this.apiBase = authManager.getApiBase();
  }

  /**
   * Get the current user's ID (cached)
   */
  private async getMyUserId(): Promise<string | null> {
    if (this.myUserId) return this.myUserId;
    try {
      const me = await this.graphClient.getMe();
      this.myUserId = me.id;
      return this.myUserId;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      return null;
    }
  }

  /**
   * Make an authenticated API request with automatic retry on auth failures
   */
  private async apiRequest<T = any>(
    endpoint: string,
    options: RequestInit = {},
    retryCount = 0,
  ): Promise<T> {
    const token = await this.authManager.getToken();

    const response = await fetch(`${this.apiBase}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    // Handle auth failures with automatic retry
    if (response.status === 401 || response.status === 403) {
      if (retryCount < MAX_RETRY_ATTEMPTS) {
        log.debug(
          `Auth failed (${response.status}), invalidating token (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`,
        );
        this.authManager.invalidateToken();
        return this.apiRequest(endpoint, options, retryCount + 1);
      }
      throw new AuthError(
        `Authentication failed after ${MAX_RETRY_ATTEMPTS} retries`,
        "AUTH_EXPIRED",
        "teams",
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // ==========================================================================
  // Conversation Methods
  // ==========================================================================

  /**
   * Get list of conversations with optional filtering
   */
  async getConversations(
    options: ConversationListOptions = {},
  ): Promise<Conversation[]> {
    const { limit = 50, since, until, search } = options;

    const data = await this.apiRequest<ConversationsApiResponse>(
      `/conversations?view=msnp24Equivalent&pageSize=${limit}`,
    );

    let conversations: Conversation[] = (data.conversations ?? []).map(
      (c: any) => ({
        id: c.id,
        topic:
          c.threadProperties?.topic ||
          c.threadProperties?.spaceThreadTopic ||
          "Private Chat",
        type: c.conversationType,
        lastActivity: c.lastMessage?.composetime,
        lastMessage: c.lastMessage
          ? {
              preview: stripHtml(c.lastMessage.content || "").slice(0, MESSAGE_PREVIEW_LENGTH),
              from: c.lastMessage.imdisplayname || "Unknown",
            }
          : undefined,
        members: c.members?.map((m: any) => m.id?.split(":")[1] || m.id) ?? [],
      }),
    );

    // Filter by time range
    if (since || until) {
      conversations = conversations.filter((c) => {
        const activityTime = parseTime(c.lastActivity);
        if (!activityTime) return false;
        if (since && activityTime < since) return false;
        if (until && activityTime > until) return false;
        return true;
      });
    }

    // Filter by search term
    if (search && typeof search === "string") {
      const searchLower = search.toLowerCase();
      conversations = conversations.filter(
        (c) =>
          c.topic?.toLowerCase().includes(searchLower) ||
          c.lastMessage?.preview?.toLowerCase().includes(searchLower) ||
          c.members?.some((m) => m?.toLowerCase().includes(searchLower)),
      );
    }

    return conversations;
  }

  /**
   * Search conversations by query
   * For private chats, resolves user IDs to names using Graph API
   */
  async searchConversations(
    query: string,
    limit: number = 10,
  ): Promise<Conversation[]> {
    const allConversations = await this.getConversations({ limit: 100 });
    const searchLower = query.toLowerCase();
    const myUserId = await this.getMyUserId();

    // First, try basic search (topic, message preview)
    const basicMatches = allConversations.filter(
      (c) =>
        c.topic?.toLowerCase().includes(searchLower) ||
        c.lastMessage?.preview?.toLowerCase().includes(searchLower) ||
        c.lastMessage?.from?.toLowerCase().includes(searchLower),
    );

    if (basicMatches.length >= limit) {
      return basicMatches.slice(0, limit);
    }

    // For private chats (topic is "Private Chat"), resolve user IDs to names
    const privateChats = allConversations.filter(
      (c) => c.topic === "Private Chat" && extractUserIdsFromConversationId(c.id),
    );

    // Collect all other-user IDs to resolve
    const userIdsToResolve = new Set<string>();
    for (const chat of privateChats) {
      const userIds = extractUserIdsFromConversationId(chat.id);
      if (userIds) {
        for (const id of userIds) {
          if (id !== myUserId) {
            userIdsToResolve.add(id);
          }
        }
      }
    }

    // Batch resolve user names via Graph API
    const userMap = await this.graphClient.getUsersByIds([...userIdsToResolve]);

    // Match private chats by resolved user names
    const privateMatches: Conversation[] = [];
    for (const chat of privateChats) {
      // Skip if already matched in basic search
      if (basicMatches.some((m) => m.id === chat.id)) continue;

      const userIds = extractUserIdsFromConversationId(chat.id);
      if (!userIds) continue;

      // Find the other person's ID
      const otherUserId = userIds.find((id) => id !== myUserId);
      if (!otherUserId) continue;

      const user = userMap.get(otherUserId);
      if (user) {
        const nameMatch =
          user.displayName?.toLowerCase().includes(searchLower) ||
          user.mail?.toLowerCase().includes(searchLower) ||
          user.givenName?.toLowerCase().includes(searchLower) ||
          user.surname?.toLowerCase().includes(searchLower);

        if (nameMatch) {
          // Enrich conversation with resolved name
          privateMatches.push({
            ...chat,
            topic: user.displayName || "Private Chat",
            resolvedUser: {
              id: otherUserId,
              displayName: user.displayName,
              email: user.mail,
            },
          });
        }
      }
    }

    // Combine results
    const combined = [...basicMatches, ...privateMatches];
    return combined.slice(0, limit);
  }

  /**
   * Try to access a thread directly by ID
   * Returns true if the thread exists, false otherwise
   */
  private async threadExists(conversationId: string): Promise<boolean> {
    const region = this.authManager.getRegion();
    const token = await this.authManager.getToken(); // let auth errors propagate
    const threadUrl = `https://teams.cloud.microsoft/api/chatsvc/${region}/v1/threads/${encodeURIComponent(conversationId)}?view=msnp24Equivalent`;

    try {
      const response = await fetch(threadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      return response.ok;
    } catch {
      return false; // network errors only — auth is already resolved above
    }
  }

  /**
   * Get all user IDs that we have existing private chats with
   * This is done client-side by parsing conversation IDs
   */
  private async getExistingPrivateChatUserIds(): Promise<Set<string>> {
    const myUserId = await this.getMyUserId();
    const conversations = await this.getConversations({ limit: 100 });
    const userIds = new Set<string>();

    for (const conv of conversations) {
      const ids = extractUserIdsFromConversationId(conv.id);
      if (ids) {
        for (const id of ids) {
          if (id !== myUserId) {
            userIds.add(id);
          }
        }
      }
    }

    return userIds;
  }

  /**
   * Find 1:1 private conversation with a specific person (optimized)
   *
   * Algorithm:
   * 1. Search for user via Graph API (fast)
   * 2. If 1 result: try direct thread lookup
   * 3. If multiple results: filter to those we've chatted with, ask user if still ambiguous
   *
   * @param personName - Name or partial name of the person
   * @returns FindPrivateChatResult with status and conversation or candidates
   */
  async findPrivateChat(personName: string): Promise<FindPrivateChatResult> {
    const myUserId = await this.getMyUserId();
    if (!myUserId) {
      return { status: "not_found", message: "Could not determine current user ID" };
    }

    // Step 1: Search for user via Graph API
    const rawResults = await this.graphClient.searchPeople(personName, 10);

    // Filter out non-GUID IDs (external contacts) and the current user
    const searchResults = rawResults.filter(
      user => isValidGuid(user.id) && user.id !== myUserId
    );

    if (searchResults.length === 0) {
      return { status: "not_found", message: `No user found matching "${personName}"` };
    }

    // Step 2: If exactly 1 result, try direct thread lookup
    if (searchResults.length === 1) {
      const user = searchResults[0];
      const userId = user.id;

      // Try both ID orderings
      const convId1 = constructPrivateChatId(userId, myUserId);
      const convId2 = constructPrivateChatId(myUserId, userId);

      if (await this.threadExists(convId1)) {
        return {
          status: "found",
          conversation: {
            id: convId1,
            topic: user.displayName,
            type: "Chat",
            lastActivity: "",
            resolvedUser: {
              id: userId,
              displayName: user.displayName,
              email: user.emailAddresses?.[0]?.address,
            },
          },
        };
      }

      if (await this.threadExists(convId2)) {
        return {
          status: "found",
          conversation: {
            id: convId2,
            topic: user.displayName,
            type: "Chat",
            lastActivity: "",
            resolvedUser: {
              id: userId,
              displayName: user.displayName,
              email: user.emailAddresses?.[0]?.address,
            },
          },
        };
      }

      // User exists but no chat history
      return {
        status: "no_chat",
        message: `Found user "${user.displayName}" but no existing private chat. You may need to start a new conversation.`,
        candidates: [{
          userId,
          displayName: user.displayName,
          email: user.emailAddresses?.[0]?.address,
          hasExistingChat: false,
        }],
      };
    }

    // Step 3: Multiple results - filter to those we've chatted with
    const existingChatUserIds = await this.getExistingPrivateChatUserIds();

    const candidates: PrivateChatCandidate[] = [];
    for (const user of searchResults) {
      const hasExistingChat = existingChatUserIds.has(user.id);

      // Determine conversation ID if chat exists
      let conversationId: string | undefined;
      if (hasExistingChat) {
        const convId1 = constructPrivateChatId(user.id, myUserId);
        const convId2 = constructPrivateChatId(myUserId, user.id);
        // Check which one exists (one of them must since user is in existingChatUserIds)
        if (await this.threadExists(convId1)) {
          conversationId = convId1;
        } else {
          conversationId = convId2;
        }
      }

      candidates.push({
        userId: user.id,
        displayName: user.displayName,
        email: user.emailAddresses?.[0]?.address,
        hasExistingChat,
        conversationId,
      });
    }

    // Filter to only those with existing chats
    const withChats = candidates.filter(c => c.hasExistingChat);

    if (withChats.length === 1) {
      // Exactly one match with existing chat
      const match = withChats[0];
      return {
        status: "found",
        conversation: {
          id: match.conversationId!,
          topic: match.displayName,
          type: "Chat",
          lastActivity: "",
          resolvedUser: {
            id: match.userId,
            displayName: match.displayName,
            email: match.email,
          },
        },
      };
    }

    if (withChats.length > 1) {
      // Multiple matches with existing chats - ambiguous
      return {
        status: "ambiguous",
        message: `Multiple people match "${personName}" and have existing chats. Please select one.`,
        candidates: withChats,
      };
    }

    // No existing chats with any matches
    return {
      status: "ambiguous",
      message: `Multiple people match "${personName}" but none have existing chats. Please select one to start a conversation.`,
      candidates,
    };
  }

  /**
   * Get members of a conversation
   * Uses /threads/{id} endpoint to get member list, then enriches with display names from messages
   */
  async getConversationMembers(
    conversationId: string,
  ): Promise<ConversationMember[]> {
    // Get thread details which includes full member list
    const region = this.authManager.getRegion();
    const token = await this.authManager.getToken();

    const threadUrl = `https://teams.cloud.microsoft/api/chatsvc/${region}/v1/threads/${encodeURIComponent(conversationId)}?view=msnp24Equivalent`;

    const threadRes = await fetch(threadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!threadRes.ok) {
      throw new Error(
        `Failed to get thread details: ${threadRes.status} ${threadRes.statusText}`,
      );
    }

    const thread = (await threadRes.json()) as any;
    const members: ConversationMember[] = [];

    // Build a map of user IDs to display names from recent messages
    const displayNameMap = new Map<string, string>();

    try {
      const messages = await this.getMessages(conversationId, { limit: 50 });
      for (const msg of messages) {
        if (msg.fromId && msg.from && msg.from !== "Unknown") {
          // Extract the orgid from fromId if it contains it
          const orgIdMatch = msg.fromId.match(/orgid:([a-f0-9-]+)/i);
          if (orgIdMatch) {
            displayNameMap.set(orgIdMatch[1], msg.from);
          } else {
            displayNameMap.set(msg.fromId, msg.from);
          }
        }
      }
    } catch (error) {
      // Let auth errors propagate — only ignore non-auth errors (e.g. parsing)
      if (error instanceof AuthError) throw error;
      // Ignore non-auth errors when fetching messages for display names
    }

    // Process thread members
    for (const m of thread.members ?? []) {
      // Extract user ID from member ID (8:orgid:xxx -> xxx)
      const idParts = (m.id as string).split(":");
      const userId = idParts[idParts.length - 1];
      const orgId = idParts.length >= 3 ? idParts[2] : userId;

      members.push({
        id: userId,
        odataId: m.id,
        displayName: displayNameMap.get(orgId) || displayNameMap.get(userId),
        role: m.role || "User",
        joinedAt: m.rangeStart
          ? new Date(m.rangeStart).toISOString()
          : undefined,
      });
    }

    return members;
  }

  // ==========================================================================
  // Message Methods
  // ==========================================================================

  /**
   * Get messages from a conversation
   */
  async getMessages(
    conversationId: string,
    options: MessageListOptions = {},
  ): Promise<Message[]> {
    const { limit = 50, since, until, search } = options;

    // Fetch more if we need to filter
    const fetchLimit =
      since || until || search ? Math.min(limit * 3, MAX_FETCH_LIMIT) : limit;

    const data = await this.apiRequest<MessagesApiResponse>(
      `/conversations/${encodeURIComponent(conversationId)}/messages?pageSize=${fetchLimit}`,
    );

    let messages: Message[] = (data.messages ?? []).map((m: any) => ({
      id: m.id,
      from: m.imdisplayname || "Unknown",
      fromId: m.from?.split(":")[1] || m.from,
      content: stripHtml(m.content || ""),
      contentType: m.contenttype,
      time: m.composetime,
      messageType: m.messagetype,
      attachments: m.amsreferences || [],
      mentions: m.mentions || [],
    }));

    // Filter by time range
    if (since || until) {
      messages = messages.filter((m) => {
        const msgTime = parseTime(m.time);
        if (!msgTime) return false;
        if (since && msgTime < since) return false;
        if (until && msgTime > until) return false;
        return true;
      });
    }

    // Filter by search term
    if (search && typeof search === "string") {
      const searchLower = search.toLowerCase();
      messages = messages.filter(
        (m) =>
          m.content?.toLowerCase().includes(searchLower) ||
          m.from?.toLowerCase().includes(searchLower),
      );
    }

    return messages.slice(0, limit);
  }

  /**
   * Resolve message format to Teams content type and message type.
   * Shared by sendMessage and sendReply.
   */
  private formatMessage(
    message: string,
    format: MessageFormat = "html",
  ): { content: string; messagetype: string } {
    switch (format) {
      case "markdown":
        return { content: message, messagetype: "Text" };
      case "html":
      default:
        return { content: message, messagetype: "RichText/Html" };
    }
  }

  /**
   * Create a new chat.
   * - 1 member: 1:1 chat (construct conversation ID directly)
   * - 2+ members: group chat (POST to /threads endpoint)
   *
   * memberOrgIds should NOT include the current user — they are added automatically.
   */
  async createChat(
    memberOrgIds: string[],
    topic?: string,
  ): Promise<{ conversationId: string; type: "oneOnOne" | "group" }> {
    const myUserId = await this.getMyUserId();
    if (!myUserId) {
      throw new Error("Could not determine current user ID");
    }

    // 1:1 chat — just construct the conversation ID
    if (memberOrgIds.length === 1) {
      const conversationId = constructPrivateChatId(myUserId, memberOrgIds[0]);
      return { conversationId, type: "oneOnOne" };
    }

    // Group chat — POST to /threads endpoint
    const region = this.authManager.getRegion();
    const token = await this.authManager.getToken();
    const threadsUrl = `https://teams.cloud.microsoft/api/chatsvc/${region}/v1/threads`;

    const allMemberIds = [myUserId, ...memberOrgIds];
    const members = allMemberIds.map((id, i) => ({
      id: `8:orgid:${id}`,
      role: i === 0 ? "Admin" : "User",
    }));

    const properties: Record<string, string> = {
      threadType: "chat",
    };
    if (topic) {
      properties.topic = topic;
    }

    const response = await fetch(threadsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ members, properties }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Create group chat failed ${response.status}: ${text}`);
    }

    // Extract conversation ID from Location header or response body
    const location = response.headers.get("Location");
    const data: any = await response.json().catch(() => null);
    const conversationId =
      location?.split("/threads/")[1]?.split("?")[0] ||
      data?.id;

    if (!conversationId) {
      throw new Error(
        "Could not extract conversation ID from response. " +
        `Location: ${location}, Body: ${JSON.stringify(data)}`,
      );
    }

    return {
      conversationId: decodeURIComponent(conversationId),
      type: "group",
    };
  }

  /**
   * Send a message to a conversation
   */
  async sendMessage(
    conversationId: string,
    message: string,
    format: MessageFormat = "html",
  ): Promise<{ success: boolean; messageId?: string; arrivalTime?: number }> {
    const { content, messagetype } = this.formatMessage(message, format);

    const result = await this.apiRequest<any>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content,
          messagetype,
          contenttype: "text",
        }),
      },
    );
    return {
      success: true,
      messageId: result.id,
      arrivalTime: result.OriginalArrivalTime,
    };
  }

  /**
   * Send a threaded reply to a specific message
   * Uses the ;messageid= format in the conversation URL to create a proper thread reply
   */
  async sendReply(
    conversationId: string,
    parentMessageId: string,
    message: string,
    format: MessageFormat = "html",
  ): Promise<{ success: boolean; messageId?: string; arrivalTime?: number }> {
    const { content, messagetype } = this.formatMessage(message, format);
    // The thread conversation ID format is: {conversationId};messageid={parentMessageId}
    const threadConversationId = `${conversationId};messageid=${parentMessageId}`;

    const result = await this.apiRequest<any>(
      `/conversations/${encodeURIComponent(threadConversationId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content,
          messagetype,
          contenttype: "text",
        }),
      },
    );
    return {
      success: true,
      messageId: result.id,
      arrivalTime: result.OriginalArrivalTime,
    };
  }

  // ==========================================================================
  // Meeting Recording Methods
  // ==========================================================================

  /**
   * Find meeting recordings in a conversation
   */
  async getMeetingRecordings(
    conversationId: string,
  ): Promise<MeetingRecording[]> {
    const data = await this.apiRequest<MessagesApiResponse>(
      `/conversations/${encodeURIComponent(conversationId)}/messages?pageSize=100`,
    );

    const recordings: MeetingRecording[] = [];

    for (const msg of data.messages ?? []) {
      const content = msg.content || "";
      const msgType = msg.messagetype || "";

      // Look for meeting recording messages
      const isRecordingMessage = msgType === "RichText/Media_CallRecording";
      const hasRecordingContent =
        content.includes("CallRecording") ||
        content.includes("Recording") ||
        content.includes("asyncgw.teams.microsoft.com") ||
        content.includes("web.microsoftstream.com") ||
        (content.includes("sharepoint.com") && content.includes("video"));

      if (isRecordingMessage || hasRecordingContent) {
        // Extract all URLs from content
        const urlMatches = content.match(/https?:\/\/[^\s<>"&]+/g) || [];

        // Categorize URLs
        const transcriptUrls: string[] = [];
        const videoUrls: string[] = [];
        const sharepointUrls: string[] = [];

        for (const url of urlMatches) {
          const decodedUrl = url.replace(/&amp;/g, "&");

          if (decodedUrl.includes("/views/transcript")) {
            transcriptUrls.push(decodedUrl);
          } else if (decodedUrl.includes("/views/video")) {
            videoUrls.push(decodedUrl);
          } else if (
            decodedUrl.includes("sharepoint.com") ||
            decodedUrl.includes("microsoftstream.com")
          ) {
            sharepointUrls.push(decodedUrl);
          }
        }

        recordings.push({
          messageId: msg.id,
          time: msg.composetime,
          from: msg.imdisplayname || "System",
          messageType: msgType,
          preview: stripHtml(content).slice(0, RECORDING_PREVIEW_LENGTH),
          transcriptUrls,
          videoUrls,
          sharepointUrls,
          rawContent: content,
        });
      }
    }

    return recordings;
  }

  // ==========================================================================
  // Transcript Methods
  // ==========================================================================

  /**
   * Fetch and parse meeting transcript
   */
  async getTranscript(url: string): Promise<TranscriptResult> {
    const token = await this.authManager.getToken(); // let auth errors propagate

    try {
      // Determine URL type and adjust if needed
      let transcriptUrl = url;
      const isAmsUrl = url.includes("asyncgw.teams.microsoft.com");
      const isSharePointUrl = url.includes("sharepoint.com");

      // For AMS URLs, ensure we're hitting the transcript view
      if (isAmsUrl && !url.includes("/views/transcript")) {
        transcriptUrl = url.replace("/views/video", "/views/transcript");
      }

      // SharePoint URLs require separate authentication
      if (isSharePointUrl) {
        return {
          success: false,
          error:
            "SharePoint URLs require separate authentication. Use the Teams AMS transcript URL instead (from transcriptUrls in meeting recordings).",
          url: transcriptUrl,
        };
      }

      const response = await fetch(transcriptUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch transcript: ${response.status} ${response.statusText}`,
          url: transcriptUrl,
        };
      }

      const contentType = response.headers.get("content-type") || "";
      const rawContent = await response.text();

      // Parse VTT format with speaker tags
      if (contentType.includes("text/vtt") || rawContent.startsWith("WEBVTT")) {
        const lines = rawContent.split("\n");
        const segments: TranscriptSegment[] = [];
        const speakersSet = new Set<string>();
        let currentSpeaker = "";

        for (const line of lines) {
          // Match speaker tags like <v Speaker Name>text</v>
          const speakerMatch = line.match(/<v\s+([^>]+)>([^<]*)/);
          if (speakerMatch) {
            const speaker = speakerMatch[1].trim();
            const text = speakerMatch[2]
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .trim();

            speakersSet.add(speaker);

            if (speaker !== currentSpeaker) {
              currentSpeaker = speaker;
              if (text) {
                segments.push({ speaker, text });
              }
            } else if (text && segments.length > 0) {
              segments[segments.length - 1].text += " " + text;
            } else if (text) {
              segments.push({ speaker, text });
            }
          }
        }

        // Format output with speaker labels
        const formattedContent = segments
          .map((seg, i) => {
            const prevSpeaker = i > 0 ? segments[i - 1].speaker : "";
            if (seg.speaker !== prevSpeaker) {
              return `\n[${seg.speaker}]\n${seg.text}`;
            }
            return seg.text;
          })
          .join(" ")
          .trim();

        return {
          success: true,
          content: formattedContent,
          speakers: Array.from(speakersSet),
          url: transcriptUrl,
        };
      }

      // Return raw content for non-VTT formats
      return {
        success: true,
        content: rawContent,
        url: transcriptUrl,
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.message,
        url,
      };
    }
  }

  // ==========================================================================
  // Summarize Methods
  // ==========================================================================

  /**
   * Get messages for summarization
   */
  async getMessagesForSummary(
    conversationId: string,
    messageCount: number = 50,
    since?: Date,
  ): Promise<{
    conversation: { id: string; topic: string; type?: string };
    messages: Message[];
    messageCount: number;
    timeRange: { oldest?: string; newest?: string } | null;
  }> {
    const messages = await this.getMessages(conversationId, {
      limit: messageCount,
      since,
    });

    // Get conversation info
    const conversations = await this.getConversations({ limit: 100 });
    const conversation = conversations.find((c) => c.id === conversationId);

    return {
      conversation: {
        id: conversationId,
        topic: conversation?.topic || "Unknown",
        type: conversation?.type,
      },
      messages,
      messageCount: messages.length,
      timeRange:
        messages.length > 0
          ? {
              oldest: messages[messages.length - 1]?.time,
              newest: messages[0]?.time,
            }
          : null,
    };
  }
}

export default TeamsApiClient;
