/**
 * Utility functions for formatting data
 */

// Re-export formatDate from mcp-utils for backwards compatibility
export { formatDate } from "mcp-utils";

/**
 * Check if two strings are equal ignoring case
 * @param str1 First string
 * @param str2 Second string
 * @returns True if the strings are equal ignoring case
 */
export function isEqualIgnoreCase(str1: string, str2: string): boolean {
  return str1.toLowerCase() === str2.toLowerCase();
}
