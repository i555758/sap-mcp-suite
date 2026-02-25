# SAP Jira MCP (v2)

English | [中文](https://github.tools.sap/sfsfmcp/sap-jira-mcp/blob/main/README-zh_CN.md)

MCP (Model Context Protocol) server for SAP Jira search and ticket management functionality.

## Quick Start

### Prerequisites
- Ensure your environment has Node.js installed, node version >= 20.0
- Starting from v2, this MCP supports both cookie-based access (via sap-auth-mcp) and API token-based Jira access. Please refer to the Environment Variables section for configuration
- Note: When using cookie-based access to Jira, this MCP needs to work with [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp)
- Note: API token method is not the recommended approach, and API token requests may be rejected
- Ensure you can properly authenticate and access SAP services like Jira and Wiki on your device
- Not recommended to run on non-SAP enrolled devices (devices not managed by SAP IT)

### ⚡️ Direct Usage with npx (Recommended) ⚡️

The easiest way to get started:

First, try running:
```bash
npx -y git+https://github.tools.sap/sfsfmcp/sap-jira-mcp.git --version
```
If it completes successfully and outputs version >= 1.1.0 in the terminal, you can add it to your MCP-enabled client:

```json
{
  "mcpServers": {
    "sap-jira": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-jira-mcp.git"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```
At this point, sap-jira-mcp is ready to run in your client. Please note that this MCP requires [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) for seamless authentication.
Please note: AUTH_COOKIE_DIR is a directory path used by `sap-auth-mcp` to store the `sap-cookie.json` file containing the authenticated Jira cookie content. Simply ensure this path has read/write permissions for the MCP. Make this path unique for Jira, as all MCPs sharing `sap-auth-mcp` will generate cookie files with the same name, and unique paths prevent overwriting.

If you encounter issues with the npx approach, prefer not to use this mode, or want deeper control by cloning the local repository, please proceed with local installation:

### Local Installation

```bash
git clone https://github.tools.sap/sfsfmcp/sap-jira-mcp.git
cd sap-jira-mcp
npm install
npm run build
```

Configure the locally running MCP server in your AI client:

```json
{
  "mcpServers": {
    "sap-jira": {
      "command": "node",
      "args": ["/path/to/sap-jira-mcp/dist/index.js"],
      "env": {
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```

## Authentication Methods

This MCP server supports two authentication methods:

### 1. Cookie-based Authentication (Recommended for SAP Internal Jira)

Cookie-based authentication uses SSO session cookies managed by [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp).

**Configuration:**
```json
{
  "mcpServers": {
    "sap-jira": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-jira-mcp.git"],
      "env": {
        "JIRA_DOMAIN": "jira.tools.sap",
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```

**Environment Variables:**
- `JIRA_DOMAIN`: Your Jira domain (e.g., "jira.tools.sap")
- `AUTH_COOKIE_DIR`: Directory where cookies are stored (optional, defaults to `./tmp`)

**Note:** Cookie-based auth requires [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) to handle the authentication flow.

### 2. API Token Authentication (Optional, typically for server-side execution like CI/CD scenarios)

API token authentication uses Jira API tokens, suitable for scenarios requiring token authentication.

**Configuration:**
```json
{
  "mcpServers": {
    "sap-jira": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-jira-mcp.git"],
      "env": {
        "JIRA_DOMAIN": "jira.tools.sap",
        "JIRA_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

**Environment Variables:**
- `JIRA_DOMAIN`: Your Jira domain (e.g., "jira.tools.sap" or other SAP internal test environments)
- `JIRA_API_TOKEN`: Jira API token (apply from SAP Jira management team)

**How to get a Jira API token:**
- [Require SAP Jira account, not personal](https://wiki.one.int.sap/wiki/display/SAPJira/REST+Services+FAQs#RESTServicesFAQs-HowdoIgetatechnicaluser?technical-user)
- [Access Token Generation](https://wiki.one.int.sap/wiki/display/SAPJira/REST+Services+FAQs#RESTServicesFAQs-HowdoIgenerateanSAPJirapersonalaccesstokenfortechnicaluser?)

## Available Tools

### Core Issue Operations
1. **create_issue**: Create a new Jira issue
2. **search_issues**: Search issues with advanced filters (supports sprint, JQL extensions, etc.)
3. **get_issue**: Get detailed information for a specific issue
4. **update_issue**: Update an existing issue's fields
5. **delete_issue**: Delete an issue (use with caution)

### Comment Operations
6. **add_comment**: Add a comment to an issue
7. **delete_comment**: Delete a comment from an issue

### User Information
8. **get_user_info**: Get detailed user information (name, email, display name, etc.)
9. **get_user_id**: Get user ID (can be used as assignee)

### Field Metadata
10. **get_field_metadata**: Get metadata for a specific field
11. **get_field_metadata_by_name**: Get field metadata by field name
12. **get_required_fields_structure**: Get required fields structure for creating a specific issue type
13. **get_project_issue_types**: Get all issue types for a project

### Sprint Management
14. **get_issue_sprint_values**: Get sprint values for a specific issue
15. **get_project_sprint_values**: Get sprint values for a project
16. **update_issue_sprint**: Update an issue's sprint (using Agile API)

### JQL Query Helper
17. **jql_examples**: Get JQL examples with current SAP Jira metadata (projects, fields, statuses, etc.) to help construct effective JQL queries

## Usage Examples

### Search issues
```json
{
  "tool": "search_issues",
  "arguments": {
    "projectKey": "MOB",
    "jql": "status = Open",
    "maxResults": 20
  }
}
```

### Get issue details
```json
{
  "tool": "get_issue",
  "arguments": {
    "issueKey": "MOB-12345"
  }
}
```

### Create a new issue
```json
{
  "tool": "create_issue",
  "arguments": {
    "projectKey": "MOB",
    "summary": "Fix login bug",
    "description": "Users cannot login after latest deployment",
    "type": "Story"
  }
}
```

### Update an existing issue
```json
{
  "tool": "update_issue",
  "arguments": {
    "issueKey": "MOB-12345",
    "summary": "Updated summary",
    "description": "Updated description"
  }
}
```

### Add a comment to an issue
```json
{
  "tool": "add_comment",
  "arguments": {
    "issue_key": "MOB-12345",
    "comment": "Issue reproduced and fix is in progress"
  }
}
```

### Delete a comment
```json
{
  "tool": "delete_comment",
  "arguments": {
    "issue_key": "MOB-12345",
    "comment_id": "12345"
  }
}
```

### Get user information
```json
{
  "tool": "get_user_info",
  "arguments": {
    "username": "i123456"
  }
}
```

### Get user ID
```json
{
  "tool": "get_user_id",
  "arguments": {
    "username": "John Smith"
  }
}
```

### Get field metadata
```json
{
  "tool": "get_field_metadata",
  "arguments": {
    "fieldId": "customfield_10240"
  }
}
```

### Get required fields structure
```json
{
  "tool": "get_required_fields_structure",
  "arguments": {
    "projectKey": "MOB",
    "issueType": "Story"
  }
}
```

### Get project issue types
```json
{
  "tool": "get_project_issue_types",
  "arguments": {
    "projectKey": "MOB"
  }
}
```

### Get issue sprint values
```json
{
  "tool": "get_issue_sprint_values",
  "arguments": {
    "issueKey": "MOB-12345"
  }
}
```

### Update issue sprint
```json
{
  "tool": "update_issue_sprint",
  "arguments": {
    "issueKey": "MOB-12345",
    "sprintId": 12345
  }
}
```

### Delete an issue (use with caution!)
```json
{
  "tool": "delete_issue",
  "arguments": {
    "issueKey": "MOB-12345"
  }
}
```

### Get JQL examples and metadata
```json
{
  "tool": "jql_examples",
  "arguments": {}
}
```

## Advanced Features

### Sprint Management
This tool provides comprehensive Sprint management capabilities:
- Query sprint information for issues
- Get all sprints for a project
- Move issues between different sprints

### Field Metadata Queries
You can query metadata for any custom field to understand field types, available values, etc.:
- Query by field ID (e.g., `customfield_10240`)
- Query by field name
- Get all required fields for creating a specific issue type

### User Management
Support for querying user information and getting user IDs for issue assignment and other operations.

## Template Configuration

### Configure the `.jira-config.json` file

`.jira-config.json` is a template configuration file for issue creation.

If your Mac does not allow hidden files to be visible, please enter the following command:

```bash
defaults write com.apple.finder AppleShowAllFiles -bool TRUE

killall Finder
```

**Notes**:
- Default template values must be modified on first use. Supports per-project template configuration for diverse ticket types and dynamic field addition to defaults.

- If you don't want to set up a creation template, it also supports creating a ticket by using an existing ticket as a reference template, allowing you to copy the field values of that ticket to the new one.

**Configuration Example**:

```json
[
  {
    "projectKey": "MOB", // SF Mobile Applications (MOB) from https://jira.tools.sap/rest/api/2/project
    "create_issue_template": [
      {
        "type": "Test",  // Issue type (Test, Epic, Story, Activity, Task, Sub-Task)
        "summary": "",   // Required
        "description": "", // Default uses the summary value
        "issuetype": {"id": "11902"}, // Optional - can be queried from project if not provided
        "assignee": "I530424", // Required - change to your inumber
        "labels": ["CT-automation-test-cases"],
        "components": [{"name": "Org-Chart"}], // Component/s
        "priority": {"name": "Medium"},
        "customfield_10240": {"value": "Functional Integration"}, // Test Classification
        "customfield_44240": { // Test Automation Type
          "value": "Mobile",
          "child": {"value": "CT-Component"}
        },
        "customfield_43758": [{"value": "Mobile Client(Android)"}], // Stack
        "customfield_22442": {"value": "Manual"}, // testType: Manual, Generic, Cucumber
        "customfield_22453": {"value": "/SHG - Blue/Android/CT/Org Chart"}, // Test Repository Path
        "customfield_44241": {"value": ""} // Git Path
      },
      {
        "type": "Story",
        "summary": "Your Story Summary/Title",
        "description": "Detailed description of the Story",
        "issuetype": {"id": "10500"},
        "assignee": "I530424",
        "components": [{"name": "Deeplink"}],
        "priority": {"name": "Medium"},
        "customfield_43758": [{"value": "Mobile Client(Android)"}],
        "customfield_15140":""
      }
      // Additional templates for Story, Activity, Task, Sub-Task, etc.
    ]
  },
  {
    "projectKey": "WRK",
    "create_issue_template": [
      // Templates for WRK project
    ]
  }
]
```

**Template Description**:
- **projectKey**: Project key value, can be queried from https://jira.tools.sap/rest/api/2/project
- **create_issue_template**: Array of issue creation templates for this project
- **type**: Issue type, must match the type field in the template
- **Required fields**: `summary` and `assignee` are typically required
- **Custom fields**: Fields starting with `customfield_` are custom fields, different projects and issue types may have different custom fields
- **Field ID queries**: Use `get_field_metadata` or `get_required_fields_structure` tools to query field IDs and metadata

**Using Templates to Create Issues**:
- When specifying `projectKey` and `type` parameters, the corresponding template will be automatically matched
- You can override any field values in the template
- If not using a template, you can copy field values by specifying an existing issue's key

## Configuration

### MCP Client Configuration

#### Claude Desktop (Recommended)

Add this to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Cookie-based authentication configuration:

```json
{
  "mcpServers": {
    "sap-auth": {
      "command": "node",
      "args": ["/path/to/sap-auth-mcp/dist/index.js"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    },
    "sap-jira": {
      "command": "node",
      "args": ["/path/to/sap-jira-mcp/dist/index.js"],
      "env": {
        "JIRA_DOMAIN": "jira.tools.sap",
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```

#### Or using npx for remote execution:

```json
{
  "mcpServers": {
    "sap-auth": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-auth-mcp.git"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    },
    "sap-jira": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-jira-mcp.git"],
      "env": {
        "JIRA_DOMAIN": "jira.tools.sap",
        "AUTH_COOKIE_DIR": "/path/to/your/cookie_file_store_folder"
      }
    }
  }
}
```

### Environment Variables

#### General Configuration
- **`JIRA_DOMAIN`**: Jira server domain
  - Default: `jira.tools.sap`
  - SAP internal test environments may use different domains
  - If not set, defaults to `jira.tools.sap`

- **`JIRA_CONFIG_DIR`**: Configuration file path (optional)
  - Directory for storing `.jira-config.json` configuration file
  - Default: `dist/` directory (module installation location)
  - Usually doesn't need to be manually set

#### Cookie Authentication
- **`AUTH_COOKIE_DIR`**: Cookie storage directory (optional)
  ```bash
  export AUTH_COOKIE_DIR="/custom/path/to/cookies"
  ```
  - Cookie file will be stored as `sap_cookies.json` in this directory
  - Default: `./tmp/sap_cookies.json`
  - Recommended to set to a fixed path for sharing authentication sessions across multiple MCP services

#### API Token Authentication
- **`JIRA_API_TOKEN`**: Jira API token
  ```bash
  export JIRA_API_TOKEN="your-api-token-here"
  ```
  - API token generated from Jira account settings
  - Used for standard Jira API authentication
  - When this variable is set, will automatically use API Token authentication instead of Cookie authentication

## Error Handling

### Structured Authentication Errors

When authentication is required, the MCP returns structured JSON errors:
```json
{
  "error": "SAP_AUTH_REQUIRED",
  "details": "Need call SAP auth MCP to prepare cookie and redo function after.",
  "data": {
    "store_path": "/path/to/cookie/directory",
    "entry_url": "https://jira.tools.sap/"
  }
}
```

### Other Common Errors

- `NETWORK_ERROR`: Check connectivity to jira.tools.sap
- `TICKET_NOT_FOUND`: Invalid ticket key or no access
- `INVALID_TICKET_KEY`: Incorrect ticket key format
- `JQL_ERROR`: Invalid JQL query syntax

## Troubleshooting

### Common Issues

**"Cannot connect to MCP server"**
- Verify the path to `dist/index.js` is correct in your client configuration
- Ensure the project is built: `npm run build`
- Check that Node.js is installed and accessible

**"Authentication Required" errors**
- Ensure [sap-auth-mcp](https://github.tools.sap/sfsfmcp/sap-auth-mcp) is configured and authenticated
- Check if cookies exist in `tmp/sap_cookies.json`
- Verify `SAP_AUTH_ACCOUNT` environment variable is set in sap-auth-mcp
- Ensure you have access to jira.tools.sap

**"JQL query failed"**
- First use the `jql_examples` tool to get current metadata
- Verify project names and field IDs are correct
- Test JQL syntax with simple queries first

### Debug Mode

Enable verbose logging:
```bash
DEBUG=* npm start
```

## Architecture

- **Pure HTTP Client**: Fast cookie-based requests for search operations
- **Cookie Storage**: Persistent session management with automatic error-driven refresh
- **HTML Content Extraction**: Comprehensive content extraction from ticket pages
- **Integration with sap-auth-mcp**: Seamless authentication handling

## Authentication Flow

1. **Cookie Loading**: Attempts to load existing cookies from storage
2. **Request Execution**: Makes HTTP requests with available cookies
3. **Error-driven Refresh**: Authentication errors trigger sap-auth-mcp for cookie refresh
4. **Session Persistence**: Saves valid cookies for future use

## Development

```bash
# Build
npm run build

# Development mode
npm run dev

# Start built version
npm start
```

### Maintaining JQL Examples

The static JQL examples used as fallbacks are stored in `src/jql_examples.md`. This AI-friendly markdown file contains:

- **JQL Examples**: Detailed examples with descriptions
- **Fallback Metadata**: Default projects, statuses, priorities, and issue types

To add or modify examples:
1. Edit `src/jql_examples.md` in standard markdown format
2. Run `npm run build` to copy the updated file to `dist/`
3. The examples will be included as markdown content when dynamic metadata fetch fails

The markdown content is returned directly to AI clients for parsing, making it easy to maintain and understand.

## License

MIT License
