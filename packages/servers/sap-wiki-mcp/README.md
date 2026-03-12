# SAP Wiki MCP Server

English | [中文](./README-zh_CN.md)

> This server is part of [sap-mcp-suite](../../../README.md). See the root README for installation and setup.

A Model Context Protocol (MCP) server that provides access to Confluence/Wiki instances through Claude and other MCP-compatible clients. This server supports both SAP's internal Wiki (wiki.one.int.sap) with cookie-based authentication and other internal wiki domains (e.g. wiki.ariba.com) with Personal Access Token (PAT) authentication. You can search wikis, execute advanced CQL queries, and fetch page content directly from your AI assistant.

## Basic Usage

**Just ask Claude naturally!** Once configured, you can immediately start using:

> "Search SAP Wiki for 'API documentation'"
> "Find pages about Fiori deployment"
> "Show me CQL query examples"

### Default Workflow (Recommended)
The server works seamlessly with [sap-auth-mcp](../sap-auth-mcp/) for authentication. Simply use these tools in Claude:

#### `general_search` - Quick Wiki Search
```
Search SAP Wiki for "Confluence administration"
```
- Searches across all SAP Wiki content
- Automatic pagination and formatting
- No authentication setup needed (handled by [sap-auth-mcp](../sap-auth-mcp/))

#### `cql_search` - Advanced Query Search
```
Search using CQL: siteSearch ~ "API" AND type = page ORDER BY lastModified DESC
```
- Advanced Confluence Query Language support
- Precise filtering by content type, dates, spaces
- Professional search capabilities

#### `cql_examples` - Learn CQL Syntax
```
Show me CQL examples for SAP Wiki
```
- 10 verified working CQL query examples
- Complete syntax reference and rules
- Best practices for SAP Wiki queries

#### `wiki_content` - Fetch Full Page Content
```
Get content from https://wiki.one.int.sap/wiki/pages/viewpage.action?pageId=123456
```
- Retrieves complete page content
- Cleaned text format (or Confluence storage XML via `format="storage"`)
- Works with any wiki.one.int.sap URL

## Authentication

The server supports two authentication modes:

### Mode 1: Cookie-Based Authentication (SAP Wiki Default)
For SAP's internal wiki (wiki.one.int.sap), the server automatically integrates with [sap-auth-mcp](../sap-auth-mcp/):
- No manual authentication needed
- Automatic cookie sharing via standardized `sap_cookies.json`
- When authentication is required, you'll see a structured error asking you to run [sap-auth-mcp](../sap-auth-mcp/)
- All authentication complexity is handled externally

### Mode 2: PAT Authentication (Custom Confluence Domains)
For custom Confluence instances, use Personal Access Token (PAT) authentication:
- Generate a PAT from your wiki portal (User Settings -> Personal Access Tokens)
- Set `WIKI_DOMAIN` and `WIKI_API_TOKEN` environment variables
- Server automatically uses Bearer token authentication
- No cookie management needed

**How to create a PAT in Confluence:**
1. Go to your Confluence instance
2. Click on your profile -> Settings
3. Navigate to "Personal Access Tokens"
4. Click "Create token" and give it a name
5. Copy the generated token (you won't see it again!)
6. Use this token in `WIKI_API_TOKEN` environment variable

## Environment Variables

#### `WIKI_DOMAIN` (Optional)
The domain of your Confluence/Wiki instance. If not set, defaults to `wiki.one.int.sap`.

Example: `WIKI_DOMAIN=wiki.ariba.com`

#### `WIKI_API_TOKEN` (Required for custom domains)
Your Personal Access Token (PAT) for authentication with custom Confluence domains. When set, the server uses Bearer token authentication instead of cookies.

Example: `WIKI_API_TOKEN=your-pat-token-here`

#### `AUTH_COOKIE_DIR` (Optional, for SAP Wiki only)
Custom directory for cookie storage when using SAP Wiki with cookie-based authentication. The filename is always `sap_cookies.json`.

Example: `AUTH_COOKIE_DIR=/shared/cookie/directory`

Default location: `~/.sap-mcp/auth.json` (shared across all SAP MCP servers).

## Tool Reference

### Search Tools

| Tool | Purpose | Required Params | Optional Params |
|------|---------|----------------|-----------------|
| `general_search` | Basic wiki search | `keyword` | `start`, `limit` |
| `cql_search` | Advanced CQL queries | `cql` | `start`, `limit` |
| `cql_examples` | Get CQL syntax help | none | none |

### Content Tools

| Tool | Purpose | Required Params | Optional Params |
|------|---------|----------------|-----------------|
| `wiki_content` | Fetch page content | `url` | `format` |

## CQL Query Examples

The server includes comprehensive CQL documentation. Use the `cql_examples` tool to see:

- Basic text searches: `siteSearch ~ "API"`
- Content type filtering: `siteSearch ~ "documentation" AND type = page`
- Date-based queries: `siteSearch ~ "release" AND lastModified > "2024-12-01"`
- Complex combinations: `title ~ "API" OR siteSearch ~ "REST endpoint"`

**Important**: SAP Wiki CQL doesn't support relative dates (like `-30d`). Use specific dates in `YYYY-MM-DD` format.

## Troubleshooting

### Common Issues

**Authentication Required Error (Cookie-based)**
- Use [sap-auth-mcp](../sap-auth-mcp/) to authenticate

**Authentication Error (PAT-based)**
- Error: "Invalid or expired API token"
- Solution: Verify your `WIKI_API_TOKEN` is correct and hasn't expired
- Generate a new PAT if needed from your Confluence instance

**Network Errors**
- Verify network connectivity to your wiki domain
- For SAP Wiki: Check VPN connection to SAP internal network
- For custom domains: Ensure firewall/proxy allows access

**CQL Syntax Errors**
- Use the `cql_examples` tool first
- Remember to use specific dates, not relative ones (e.g., `"2024-01-01"` not `"-30d"`)
- Ensure proper quoting: `"search term"`
- If CQL not supported on your Confluence instance, use `general_search` instead

**Domain Validation Errors**
- Error: "Invalid wiki URL domain"
- Solution: Ensure the URL matches your configured `WIKI_DOMAIN`
- URLs must be from the same domain specified in environment variables

### File Locations
- Auth storage: `~/.sap-mcp/auth.json` (shared across all SAP MCP servers)

## Feature Compatibility

### Supported Confluence Features
- General keyword search
- CQL (Confluence Query Language) queries
- Page content fetching
- Multiple wiki instances (via separate MCP server configurations)

### CQL Support
Most Confluence instances (version 5.5+) support CQL queries. If your instance doesn't support CQL:
- The server will return a helpful error message
- Use `general_search` tool instead for keyword-based searches
- Check with your Confluence administrator about CQL availability

### URL Formats
The server supports standard Confluence URL formats:
- `https://wiki.domain.com/pages/viewpage.action?pageId=123456`
- `https://wiki.domain.com/spaces/SPACE/pages/123456/Page+Title`
- `https://wiki.domain.com/display/SPACE/Page+Title`
