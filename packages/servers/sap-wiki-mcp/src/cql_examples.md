# CQL (Confluence Query Language) Examples for SAP Wiki

This file contains verified working CQL examples for SAP Wiki search functionality.
These examples have been tested and confirmed to work with the SAP Wiki CQL parser.

## Basic Search Examples

### 1. Simple Text Search
```cql
siteSearch ~ "API"
```
Description: Search for pages containing the word "API" anywhere in the content.

### 2. Exact Phrase Search
```cql
siteSearch ~ "Business Process"
```
Description: Search for the exact phrase "Business Process" in page content.

### 3. Multiple Keywords with AND
```cql
siteSearch ~ "SAP" AND siteSearch ~ "Integration"
```
Description: Find pages that contain both "SAP" and "Integration" keywords.

## Content Type Filtering

### 4. Search Only Pages
```cql
siteSearch ~ "documentation" AND type = page
```
Description: Search for "documentation" only in page content (excluding blog posts, attachments, etc.).

### 5. Search Only Blog Posts
```cql
siteSearch ~ "announcement" AND type = blogpost
```
Description: Search for "announcement" only in blog posts.

## Date-based Searches

### 6. Recent Content by Specific Date
```cql
siteSearch ~ "release" AND lastModified > "2024-12-01" ORDER BY lastModified DESC
```
Description: Find pages containing "release" that were modified after December 1, 2024, sorted by most recent first.

### 7. Content from Date Range
```cql
siteSearch ~ "deployment" AND lastModified > "2024-11-01" AND lastModified < "2024-12-31"
```
Description: Find pages about "deployment" modified between November 1 and December 31, 2024.

## Advanced Sorting and Filtering

### 8. Search with Relevance Sorting
```cql
siteSearch ~ "configuration" ORDER BY lastModified DESC
```
Description: Search for "configuration" and sort results by modification date (newest first).

### 9. Title-specific Search
```cql
title ~ "Getting Started"
```
Description: Search for pages whose title contains "Getting Started".

### 10. Combined Title and Content Search
```cql
title ~ "API" OR siteSearch ~ "REST endpoint"
```
Description: Find pages that either have "API" in the title OR contain "REST endpoint" in the content.

## CQL Syntax Rules for SAP Wiki

### Supported Operators:
- `~` : Contains operator (for text search)
- `=` : Equals operator (for exact matches)
- `>` : Greater than (for dates)
- `<` : Less than (for dates)
- `AND` : Logical AND
- `OR` : Logical OR

### Supported Fields:
- `siteSearch` : Full-text search across page content
- `title` : Page title
- `type` : Content type (page, blogpost, etc.)
- `lastModified` : Last modification date

### Date Format:
- Use specific dates in format: "YYYY-MM-DD"
- Example: "2024-12-15"
- Relative dates like "-30d" or "now(-30d)" are NOT supported

### Important Notes:
1. Always use double quotes for text values: "search term"
2. Use specific dates (YYYY-MM-DD) instead of relative dates
3. Field names are case-sensitive
4. Combine multiple conditions with AND/OR
5. Use ORDER BY for sorting results