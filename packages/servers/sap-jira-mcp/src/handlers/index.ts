/**
 * Handler module exports
 * Re-exports all handler registration functions from domain-specific modules
 */

export { HandlerContext, HandlerRegistrationFunction } from "./types.js";
export { jiraCustomFields } from "./shared-schemas.js";

export { registerIssueHandlers } from "./issue-handlers.js";
export { registerUserHandlers } from "./user-handlers.js";
export { registerFieldHandlers } from "./field-handlers.js";
export { registerSprintHandlers } from "./sprint-handlers.js";
export { registerTransitionHandlers } from "./transition-handlers.js";
export { registerCommentHandlers } from "./comment-handlers.js";
export { registerJqlHandlers } from "./jql-handlers.js";

/**
 * Register all handlers with the server
 */
import { HandlerContext } from "./types.js";
import { registerIssueHandlers } from "./issue-handlers.js";
import { registerUserHandlers } from "./user-handlers.js";
import { registerFieldHandlers } from "./field-handlers.js";
import { registerSprintHandlers } from "./sprint-handlers.js";
import { registerTransitionHandlers } from "./transition-handlers.js";
import { registerCommentHandlers } from "./comment-handlers.js";
import { registerJqlHandlers } from "./jql-handlers.js";

export function registerAllHandlers(context: HandlerContext): void {
  registerIssueHandlers(context);
  registerUserHandlers(context);
  registerFieldHandlers(context);
  registerSprintHandlers(context);
  registerTransitionHandlers(context);
  registerCommentHandlers(context);
  registerJqlHandlers(context);
}
