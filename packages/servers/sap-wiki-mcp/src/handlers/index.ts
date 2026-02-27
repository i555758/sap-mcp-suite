/**
 * Handler module exports for SAP Wiki MCP
 * Re-exports all handler registration functions from domain-specific modules
 */
export { WikiHandlerContext, AuthErrorHandler } from "./types.js";

// Search handlers
export {
  handleGeneralSearch,
  handleCqlExamples,
  handleCqlSearch,
  GeneralSearchSchema,
  CqlSearchSchema,
  registerSearchHandlers,
} from "./search-handlers.js";

// Content handlers
export {
  handleWikiContent,
  handleWikiUpdatePage,
  handleWikiCreatePage,
  handleWikiDeletePage,
  WikiContentSchema,
  WikiUpdatePageSchema,
  WikiCreatePageSchema,
  WikiDeletePageSchema,
  registerContentHandlers,
} from "./content-handlers.js";

import { WikiHandlerContext } from "./types.js";
import { registerSearchHandlers } from "./search-handlers.js";
import { registerContentHandlers } from "./content-handlers.js";

/**
 * Register all handlers with the server
 */
export function registerAllHandlers(context: WikiHandlerContext): void {
  registerSearchHandlers(context);
  registerContentHandlers(context);
}
