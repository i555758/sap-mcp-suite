/**
 * Utility functions for formatting data
 */

/**
 * Format a date string to a human-readable format
 * @param dateString The date string to format
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Check if two strings are equal ignoring case
 * @param str1 First string
 * @param str2 Second string
 * @returns True if the strings are equal ignoring case
 */
export function isEqualIgnoreCase(str1: string, str2: string): boolean {
  return str1.toLowerCase() === str2.toLowerCase();
}
