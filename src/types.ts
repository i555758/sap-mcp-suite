/**
 * Type definitions for SAP MS Teams MCP
 */

// ============================================================================
// Token Types
// ============================================================================

export interface TokenData {
  token: string;
  aud: string;
  exp: number;
  expDate: string;
  refreshedAt: string;
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

// Token from sap_tokens.json (saved by sap-auth-mcp)
export interface GraphToken {
  token: string;
  audience: string;
  expiresAt: number;
  scopes: string[];
  appDisplayName?: string;
  key?: string;
}

export interface SapTokensFile {
  tokens: GraphToken[];
  timestamp: number;
  source: string;
}

// ============================================================================
// Graph API Types
// ============================================================================

export interface GraphPerson {
  id: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  emailAddresses?: { address: string; rank?: number }[];
  phones?: { type: string; number: string }[];
  department?: string;
  jobTitle?: string;
  officeLocation?: string;
  companyName?: string;
  userPrincipalName?: string;
}

export interface GraphCalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer?: { emailAddress: { name: string; address: string } };
  attendees?: {
    emailAddress: { name: string; address: string };
    type: string;
    status?: { response: string };
  }[];
  location?: { displayName: string };
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string;
  bodyPreview?: string;
  webLink?: string;
}

export interface GraphUser {
  id: string;
  displayName: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones?: string[];
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface TeamsConfig {
  /** User email for SAP SSO authentication */
  userEmail: string;
  /** Teams region: emea, amer, or apac */
  region?: "emea" | "amer" | "apac";
  /** Path to store cookies from sap-auth-mcp */
  cookieStorePath?: string;
  /** Token refresh interval in minutes */
  tokenRefreshMinutes?: number;
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Conversation {
  id: string;
  topic: string;
  type: string;
  lastActivity: string;
  lastMessage?: {
    preview: string;
    from: string;
  };
  members?: string[];
}

export interface ConversationListOptions {
  limit?: number;
  since?: Date;
  until?: Date;
  search?: string;
}

// ============================================================================
// Message Types
// ============================================================================

export interface Message {
  id: string;
  from: string;
  fromId?: string;
  content: string;
  contentType: string;
  time: string;
  messageType: string;
  attachments?: any[];
  mentions?: any[];
}

export interface MessageListOptions {
  limit?: number;
  since?: Date;
  until?: Date;
  search?: string;
}

export interface SendMessageRequest {
  content: string;
  messagetype: string;
  contenttype: string;
}

// ============================================================================
// Meeting Recording Types
// ============================================================================

export interface MeetingRecording {
  messageId: string;
  time: string;
  from: string;
  messageType: string;
  preview: string;
  transcriptUrls: string[];
  videoUrls: string[];
  sharepointUrls: string[];
  rawContent: string;
}

// ============================================================================
// Transcript Types
// ============================================================================

export interface TranscriptResult {
  success: boolean;
  content?: string;
  speakers?: string[];
  error?: string;
  url: string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ConversationsApiResponse {
  conversations: any[];
}

export interface MessagesApiResponse {
  messages: any[];
}

// ============================================================================
// Tool Parameter Types
// ============================================================================

export interface ConversationsParams {
  limit?: number;
  since?: string;
  until?: string;
  search?: string;
}

export interface MessagesParams {
  conversationId: string;
  limit?: number;
  since?: string;
  until?: string;
  search?: string;
}

export interface SendMessageParams {
  conversationId: string;
  message: string;
}

export interface SearchConversationParams {
  query: string;
  limit?: number;
}

export interface ConversationsByTimeParams {
  since: string;
  until?: string;
  limit?: number;
}

export interface SearchMessagesParams {
  conversationId: string;
  query: string;
  limit?: number;
}

export interface MeetingRecordingsParams {
  conversationId: string;
}

export interface TranscriptParams {
  url: string;
}

export interface SummarizeParams {
  conversationId: string;
  messageCount?: number;
  since?: string;
}
