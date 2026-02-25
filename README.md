# SAP Wiki MCP Server

English | [中文](https://github.tools.sap/sfsfmcp/sap-wiki-mcp/blob/main/README-zh_CN.md)

A Model Context Protocol (MCP) server that provides access to Confluence/Wiki instances through Claude and other MCP-compatible clients. This server supports both SAP's internal Wiki (wiki.one.int.sap) with cookie-based authentication and other internal wiki domains for ex- (wiki.ariba.com) with Personal Access Token (PAT) authentication. You can search wikis, execute advanced CQL queries, and fetch page content directly from your AI assistant.

## Quick Start

### Prerequisites
- Ensure your environment has Node.js installed, node version >= 20.0
- **For SAP Wiki (wiki.one.int.sap)**: Requires [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) for cookie-based authentication
- **For other domains**: Requires a Personal Access Token (PAT) from wiki
- Ensure you're able to use the PAT to access wiki. for ex-

```bash
curl -H "Authorization: Bearer YOUR_PAT" \
  "https://wiki.ariba.com/rest/api/search?cql=type=page&limit=1"
```

If it returns results → CQL is supported ✅ 
If it returns 404/error → CQL might not be available ❌


### ⚡ Fastest Way (Recommended) ⚡️

**No installation needed!** Test the server directly with npx:

# 1. Test that it works
```bash
npx -y git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git --version
```

# 2. If version shows up >= 1.1.0, you can add it to your MCP-compatible client:

```json
{
  "mcpServers": {
    "sap-wiki": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```

That's it! Your MCP is now ready to work with your client.

If you find issues with the npx approach, or prefer not to use this mode, or want to have deeper control over the project by cloning the local repo, then proceed with local installation:

### Alternative: Local Installation

If you prefer local installation for development:

1. **Clone and build**:
```bash
git clone https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git
cd sap-wiki-mcp
npm install
npm run build
```

2. **Configure MCP**:
```json
{
  "mcpServers": {
    "sap-wiki": {
      "command": "node",
      "args": ["/path/to/sap-wiki-mcp/dist/index.js"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```

## Basic Usage

**Just ask Claude naturally!** Once configured, you can immediately start using:

> "Search SAP Wiki for 'API documentation'"
> "Find pages about Fiori deployment"
> "Show me CQL query examples"

### Default Workflow (Recommended)
The server works seamlessly with [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) for authentication. Simply use these tools in Claude:

#### `general_search` - Quick Wiki Search
```
Search SAP Wiki for "Confluence administration"
```
- Searches across all SAP Wiki content
- Automatic pagination and formatting
- No authentication setup needed (handled by [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp))

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
- Cleaned text format (or raw HTML if needed)
- Works with any wiki.one.int.sap URL

## Authentication

The server supports two authentication modes:

### Mode 1: Cookie-Based Authentication (SAP Wiki Default)
For SAP's internal wiki (wiki.one.int.sap), the server automatically integrates with [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp):
- No manual authentication needed
- Automatic cookie sharing via standardized `sap_cookies.json`
- When authentication is required, you'll see a structured error asking you to run [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp)
- All authentication complexity is handled externally

### Mode 2: PAT Authentication (Custom Confluence Domains)
For custom Confluence instances, use Personal Access Token (PAT) authentication:
- Generate a PAT from your wiki portal (User Settings → Personal Access Tokens)
- Set `WIKI_DOMAIN` and `WIKI_API_TOKEN` environment variables
- Server automatically uses Bearer token authentication
- No cookie management needed

**How to create a PAT in Confluence:**
1. Go to your Confluence instance
2. Click on your profile → Settings
3. Navigate to "Personal Access Tokens"
4. Click "Create token" and give it a name
5. Copy the generated token (you won't see it again!)
6. Use this token in `WIKI_API_TOKEN` environment variable



## Advanced Configuration

### Environment Variables

The server supports three environment variables for configuration:

#### 1. `WIKI_DOMAIN` (Optional)
The domain of your Confluence/Wiki instance. If not set, defaults to `wiki.one.int.sap`.

**Example:**
- `WIKI_DOMAIN=wiki.ariba.com`

#### 2. `WIKI_API_TOKEN` (Required for custom domains)
Your Personal Access Token (PAT) for authentication with custom Confluence domains. When set, the server uses Bearer token authentication instead of cookies.

**Example:**
- `WIKI_API_TOKEN=your-pat-token-here`

#### 3. `AUTH_COOKIE_DIR` (Optional, for SAP Wiki only)
Custom directory for cookie storage when using SAP Wiki with cookie-based authentication.

**Example:**
- `AUTH_COOKIE_DIR=/shared/cookie/directory`

### Configuration Examples

#### Example 1: SAP Wiki (Cookie Authentication)
```json
{
  "mcpServers": {
    "sap-wiki": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/cookies"
      }
    }
  }
}
```

#### Example 2: Custom Confluence Domain (PAT Authentication)
```json
{
  "mcpServers": {
    "ariba-wiki": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git"],
      "env": {
        "WIKI_DOMAIN": "wiki.ariba.com",
        "WIKI_API_TOKEN": "your-pat-token-here"
      }
    }
  }
}
```

#### Example 3: Multiple Wiki Instances
```json
{
  "mcpServers": {
    "sap-wiki": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/cookies"
      }
    },
    "ariba-wiki": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git"],
      "env": {
        "WIKI_DOMAIN": "wiki.ariba.com",
        "WIKI_API_TOKEN": "your-ariba-pat-token"
      }
    },
    "company-wiki": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git"],
      "env": {
        "WIKI_DOMAIN": "confluence.company.com",
        "WIKI_API_TOKEN": "your-company-pat-token"
      }
    }
  }
}
```

### Cookie Storage (SAP Wiki Only)
When using SAP Wiki with cookie-based authentication:

- Default location: `{project_root}/tmp/sap_cookies.json`
- Customizable via `AUTH_COOKIE_DIR` environment variable
- Shared with [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) and sap-jira-mcp when using same `AUTH_COOKIE_DIR`
- The `customStorePath` parameter takes precedence over the environment variable when integrating with sap-auth-mcp

**Note**: `AUTH_COOKIE_DIR` specifies the directory only. The filename is always `sap_cookies.json`.

### Alternative Installation Methods

#### Using Volta (for Node.js version management)
```bash
# Install Volta
curl https://get.volta.sh | bash

# Install Node.js 20
volta install node@20

# Build project
git clone <repository-url>
cd sap-wiki-mcp
npm install
npm run build
```

#### Running with other MCP clients
```bash
node /path/to/sap-wiki-mcp/dist/index.js
```

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
| `wiki_content` | Fetch page content | `url` | `raw` |

## CQL Query Examples

The server includes comprehensive CQL documentation. Use the `cql_examples` tool to see:

- Basic text searches: `siteSearch ~ "API"`
- Content type filtering: `siteSearch ~ "documentation" AND type = page`
- Date-based queries: `siteSearch ~ "release" AND lastModified > "2024-12-01"`
- Complex combinations: `title ~ "API" OR siteSearch ~ "REST endpoint"`

**Important**: SAP Wiki CQL doesn't support relative dates (like `-30d`). Use specific dates in `YYYY-MM-DD` format.

## Troubleshooting

### Common Issues

**NPX Command Issues**
```bash
# Test if npx works
npx -y git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git --version

# If you get permission errors, try:
npm config set registry https://registry.npmjs.org/

# If behind corporate proxy, check your npm proxy settings:
npm config get proxy
npm config get https-proxy
```

**Authentication Required Error (Cookie-based)**
- Use [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) to authenticate

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
- Cookie storage: `./tmp/sap_cookies.json` (default directory customizable via `AUTH_COOKIE_DIR` env var)
- Shared with [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) and sap-jira-mcp when using same `AUTH_COOKIE_DIR`

## Development

### Building from Source
```bash
npm run build
```

## Local Development & Testing

This section provides complete instructions for developing and testing the MCP server locally.

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git
cd sap-wiki-mcp

# Install dependencies
npm install
```

### Step 2: Build the Project

```bash
# Compile TypeScript to JavaScript
npm run build
```

This creates the `dist/` directory with compiled JavaScript files.

**Verify the build:**
```bash
# Check that dist/index.js was created
ls -la dist/

# You should see:
# dist/index.js
# dist/pure-http-client.js
# dist/cookie-storage.js
# dist/types.js
```

### Step 3: Test the Server Locally (Optional)

Before integrating with MCP clients, you can verify the server starts correctly:

```bash
# Run the server directly
node dist/index.js
```

**Expected output:**
```
🏢 SAP Wiki mode: wiki.one.int.sap with cookie authentication
🚀 SAP Wiki MCP Server running on stdio
```

Or if you set custom domain environment variables:
```bash
# Test with custom domain
WIKI_DOMAIN=wiki.ariba.com WIKI_API_TOKEN=your-token node dist/index.js
```

**Expected output:**
```
🌐 Custom domain mode: wiki.ariba.com with PAT authentication
🚀 Wiki MCP Server running on stdio (Custom domain: wiki.ariba.com)
```

**Note:** The server will wait for input on stdin (this is normal MCP behavior). Press `Ctrl+C` to stop it.

### Step 4: Configure MCP Client for Local Development

To use your local version with Claude Desktop or other MCP clients, update your MCP configuration file:

#### Configuration for SAP Wiki (Cookie-based)

```json
{
  "mcpServers": {
    "sap-wiki-local": {
      "command": "node",
      "args": ["/absolute/path/to/your/sap-wiki-mcp/dist/index.js"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/cookies"
      }
    }
  }
}
```

#### Configuration for Custom Domain (PAT-based)

```json
{
  "mcpServers": {
    "my-wiki-local": {
      "command": "node",
      "args": ["/absolute/path/to/your/sap-wiki-mcp/dist/index.js"],
      "env": {
        "WIKI_DOMAIN": "wiki.ariba.com",
        "WIKI_API_TOKEN": "your-pat-token-here"
      }
    }
  }
}
```

**Important:** Use the **absolute path** to your local `dist/index.js` file.

### Step 5: Restart MCP Client

### Switching Back to Production

To switch back to the production (npx) version:

```json
{
  "mcpServers": {
    "sap-wiki": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/cookies", // in case using coookie based auth
        "WIKI_API_TOKEN": "your-pat-token-here", // in case using PAT for auth
        "WIKI_DOMAIN": "wiki.ariba.com" // in case using custom wiki domain
      }
    }
  }
}
```

Restart Claude Desktop to apply changes.

### Project Structure
```
sap-wiki-mcp/
├── src/                          # TypeScript source
│   ├── index.ts                  # Main MCP server
│   ├── pure-http-client.ts       # HTTP client for API calls
│   ├── cookie-storage.ts         # Cookie management
│   ├── browser-hybrid-auth.ts    # Browser automation (optional)
│   └── cql_examples.md           # CQL documentation
├── dist/                         # Compiled JavaScript
├── tmp/                          # Cookie storage
│   └── sap_cookies.json         # Shared authentication cookies
└── package.json
```

### Debugging
- Check console output for detailed error messages
- Verify cookie files in `tmp/` directory
- Test network connectivity to wiki.one.int.sap
- Browser debugging available in standalone auth mode

## Security & Privacy

- **Data Privacy**: All data requests go directly to your configured wiki domain (no intermediary servers)
- **Cookie Storage** (SAP Wiki): Cookies stored locally in `tmp/` directory
- **Token Security** (Custom Domains): PAT tokens stored in environment variables only
- **Authentication**: 
  - SAP Wiki: Official SAP SSO authentication via sap-auth-mcp
  - Custom Domains: Bearer token authentication with your PAT
- **Network**: No external data transmission beyond your configured wiki domain
- **Cookie Sharing**: Only with other SAP MCP servers via standardized files (SAP Wiki only)

## Support

1. Check troubleshooting section above
2. Verify network connectivity to your wiki domain
3. Ensure Node.js version >= 20.0
4. For SAP Wiki issues: Check [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) documentation
5. For custom domain issues: Verify your PAT token is valid and has appropriate permissions

## Feature Compatibility

### Supported Confluence Features
- ✅ General keyword search
- ✅ CQL (Confluence Query Language) queries
- ✅ Page content fetching
- ✅ Multiple wiki instances (via separate MCP server configurations)

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

## License

This project is for internal SAP use only and follows SAP's internal tool guidelines.
