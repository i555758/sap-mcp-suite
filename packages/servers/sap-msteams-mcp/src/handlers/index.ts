/**
 * Handler module exports for SAP MS Teams MCP
 * Re-exports all handler registration functions from domain-specific modules
 */
export { TeamsHandlerContext } from "./types.js";

// Conversation handlers
export {
  handleConversations,
  handleMessages,
  handleFindPrivateChat,
  handleMembers,
  registerConversationHandlers,
} from "./conversation-handlers.js";

// Messaging handlers
export { handleSend, handleReply, handleCreateChat, registerMessagingHandlers } from "./messaging-handlers.js";

// Meeting handlers
export { handleMeetingRecordings, handleTranscript, registerMeetingHandlers } from "./meeting-handlers.js";

// Calendar handlers
export { handleCalendar, registerCalendarHandlers } from "./calendar-handlers.js";

// People handlers
export {
  handleSearchPeople,
  handleManager,
  handleDirectReports,
  handleMyProfile,
  registerPeopleHandlers,
} from "./people-handlers.js";

import { TeamsHandlerContext } from "./types.js";
import { registerConversationHandlers } from "./conversation-handlers.js";
import { registerMessagingHandlers } from "./messaging-handlers.js";
import { registerMeetingHandlers } from "./meeting-handlers.js";
import { registerCalendarHandlers } from "./calendar-handlers.js";
import { registerPeopleHandlers } from "./people-handlers.js";

/**
 * Register all handlers with the server
 */
export function registerAllHandlers(context: TeamsHandlerContext): void {
  registerConversationHandlers(context);
  registerMessagingHandlers(context);
  registerMeetingHandlers(context);
  registerCalendarHandlers(context);
  registerPeopleHandlers(context);
}
