/**
 * Teams API Client for SAP MS Teams MCP
 *
 * Handles all API interactions with Microsoft Teams.
 */

import { TeamsAuthManager } from "./auth.js";
import { createLogger } from "./logger.js";
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
} from "./types.js";

const log = createLogger("teams-api");

// ============================================================================
// Constants
// ============================================================================

const MAX_RETRY_ATTEMPTS = 2;

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
 * Strip HTML tags and decode HTML entities
 */
function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
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
  private apiBase: string;

  constructor(authManager: TeamsAuthManager) {
    this.authManager = authManager;
    this.apiBase = authManager.getApiBase();
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
      throw new Error(
        `Authentication failed after ${MAX_RETRY_ATTEMPTS} retries. ` +
          "Please re-authenticate using sap-auth-mcp.",
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
              preview: stripHtml(c.lastMessage.content || "").slice(0, 100),
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
   */
  async searchConversations(
    query: string,
    limit: number = 10,
  ): Promise<Conversation[]> {
    const conversations = await this.getConversations({
      limit: 100,
      search: query,
    });
    return conversations.slice(0, limit);
  }

  /**
   * Find 1:1 private conversation with a specific person
   * This searches for direct chats (not group chats or meetings)
   *
   * @param personName - Name or partial name of the person
   * @returns The 1:1 conversation if found, null otherwise
   */
  async findPrivateChat(personName: string): Promise<Conversation | null> {
    const conversations = await this.getConversations({ limit: 100 });
    const searchLower = personName.toLowerCase();

    // Filter for 1:1 private chats
    // Teams uses various type names: "OneOnOne", "Chat", etc.
    // 1:1 chats typically have exactly 2 members and type contains "Chat" or "OneOnOne"
    const privateChats = conversations.filter((c) => {
      // Check if it's a 1:1 type conversation
      const isOneOnOne =
        c.type?.toLowerCase().includes("chat") ||
        c.type?.toLowerCase().includes("oneonone") ||
        c.type?.toLowerCase() === "conversation";

      // 1:1 chats should have 2 members (self + other person)
      const hasTwoMembers = c.members && c.members.length === 2;

      // Exclude group chats and meetings
      const isNotGroup =
        !c.type?.toLowerCase().includes("group") &&
        !c.type?.toLowerCase().includes("meeting") &&
        !c.type?.toLowerCase().includes("space");

      return isOneOnOne && hasTwoMembers && isNotGroup;
    });

    // Find the conversation where the other person matches the search
    for (const chat of privateChats) {
      // Check if any member matches the person name
      const memberMatches = chat.members?.some((m) =>
        m?.toLowerCase().includes(searchLower),
      );

      // Also check the topic/title which often contains the person's name
      const topicMatches = chat.topic?.toLowerCase().includes(searchLower);

      // Check last message sender
      const lastMessageMatches = chat.lastMessage?.from
        ?.toLowerCase()
        .includes(searchLower);

      if (memberMatches || topicMatches || lastMessageMatches) {
        return chat;
      }
    }

    return null;
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
    } catch {
      // Ignore errors when fetching messages for display names
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

  /**
   * Get conversations active in a time range
   */
  async getConversationsByTime(
    since: Date,
    until?: Date,
    limit: number = 50,
  ): Promise<Conversation[]> {
    return this.getConversations({ limit, since, until });
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
      since || until || search ? Math.min(limit * 3, 200) : limit;

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
   * Send a message to a conversation
   */
  async sendMessage(
    conversationId: string,
    message: string,
  ): Promise<{ success: boolean; messageId?: string; arrivalTime?: number }> {
    const result = await this.apiRequest<any>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content: message,
          messagetype: "Text",
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
   * Search messages in a conversation
   */
  async searchMessages(
    conversationId: string,
    query: string,
    limit: number = 20,
  ): Promise<Message[]> {
    return this.getMessages(conversationId, { limit, search: query });
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
          preview: stripHtml(content).slice(0, 200),
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
    try {
      const token = await this.authManager.getToken();

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
