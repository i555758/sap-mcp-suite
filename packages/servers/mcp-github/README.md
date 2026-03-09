# GitHub MCP Server

A Model Context Protocol server for GitHub API operations with comprehensive pull request management capabilities.

## Features

### GitHub API Integration
- **User Management**: Get current user details and user information
- **Repository Management**: List, create, and manage repositories
- **Issue Management**: Create and manage GitHub issues
- **Pull Request Management**: Create and manage pull requests with detailed information
- **Pull Request Reviews**: Get comprehensive review information and comments
- **Pull Request Comments**: Access both code review comments and general discussion comments

## Installation

### Recommended: Remote Installation (npx)

The easiest way to use this MCP server is via npx, which doesn't require cloning or building:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "git+https://github.tools.sap/sfsfmcp/mcp-github.git"
      ],
      "env": {
        "GITHUB_TOKEN": "<YOUR_GITHUB_TOKEN>",
        "GITHUB_API_URL": "https://github.tools.sap/api/v3",
        "GITHUB_DEFAULT_OWNER": "your_username"
      }
    }
  }
}
```

This method automatically downloads and runs the latest version without any manual setup.

### Alternative: Local Installation

If you need to modify the code or prefer a local installation:

1. Clone this repository
2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration

### Environment Variables

Set the following environment variables for SAP GitHub Enterprise:

```bash
export GITHUB_API_URL="https://github.tools.sap/api/v3"
export GITHUB_DEFAULT_OWNER="i530424"
# Optional: GITHUB_TOKEN is stored centrally via sap-auth after first use.
# If set, the token is persisted to ~/.sap-mcp/auth.json and subsequent
# runs don't need it in the environment.
export GITHUB_TOKEN="<YOUR_GITHUB_TOKEN>"
```

For other GitHub instances, adjust the API URL accordingly:
- GitHub.com: `https://api.github.com`
- GitHub Enterprise: `https://your-domain/api/v3`

## MCP Client Configuration

To use this GitHub MCP server with MCP-compatible clients, you need to configure the client to connect to this server.

### Configuration Format

The server can be configured in your MCP client's configuration file. Here are examples for different clients:

#### Cline (VSCode Extension)

**Recommended - Remote Method:**

Add the following to your Cline MCP settings:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "git+https://github.tools.sap/sfsfmcp/mcp-github.git"
      ],
      "env": {
        "GITHUB_TOKEN": "<YOUR_GITHUB_TOKEN>",
        "GITHUB_API_URL": "https://github.tools.sap/api/v3",
        "GITHUB_DEFAULT_OWNER": "your_username"
      }
    }
  }
}
```

**Alternative - Local Method:**

```json
{
  "mcpServers": {
    "github": {
      "command": "node",
      "args": ["/path/to/mcp-github/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "<YOUR_GITHUB_TOKEN>",
        "GITHUB_API_URL": "https://github.tools.sap/api/v3",
        "GITHUB_DEFAULT_OWNER": "your_username"
      }
    }
  }
}
```

#### Claude Desktop

**Recommended - Remote Method:**

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-github": {
      "command": "npx",
      "args": [
        "-y",
        "git+https://github.tools.sap/sfsfmcp/mcp-github.git"
      ],
      "env": {
        "GITHUB_TOKEN": "<YOUR_GITHUB_TOKEN>",
        "GITHUB_API_URL": "https://api.github.com",
        "GITHUB_DEFAULT_OWNER": "your_username"
      }
    }
  }
}
```

**Alternative - Local Method:**

```json
{
  "mcpServers": {
    "mcp-github": {
      "command": "node",
      "args": ["/path/to/mcp-github/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "<YOUR_GITHUB_TOKEN>",
        "GITHUB_API_URL": "https://api.github.com",
        "GITHUB_DEFAULT_OWNER": "your_username"
      }
    }
  }
}
```

#### Generic MCP Client

**Recommended - Remote Method:**

```json
{
  "name": "github",
  "command": "npx",
  "args": [
    "-y",
    "git+https://github.tools.sap/sfsfmcp/mcp-github.git"
  ],
  "env": {
    "GITHUB_TOKEN": "<YOUR_GITHUB_TOKEN>",
    "GITHUB_API_URL": "https://api.github.com",
    "GITHUB_DEFAULT_OWNER": "your_github_username"
  }
}
```

**Alternative - Local Method:**

```json
{
  "name": "github",
  "command": "node",
  "args": ["/absolute/path/to/mcp-github/dist/index.js"],
  "env": {
    "GITHUB_TOKEN": "<YOUR_GITHUB_TOKEN>",
    "GITHUB_API_URL": "https://api.github.com",
    "GITHUB_DEFAULT_OWNER": "your_github_username"
  }
}
```

### Configuration Parameters

- **command**: The executable to run (typically `node`)
- **args**: Array containing the path to the built server file
- **env**: Environment variables required by the server
  - `GITHUB_TOKEN`: Your GitHub Personal Access Token
  - `GITHUB_API_URL`: GitHub API endpoint (use `https://api.github.com` for GitHub.com)
  - `GITHUB_DEFAULT_OWNER`: Your default GitHub username/organization

### Setup Steps

#### For Remote Method (Recommended):

1. **Configure your MCP client** with the npx command and environment variables
2. **Restart your MCP client** to load the new server configuration
3. **Test the connection** by trying to use one of the available tools

The remote method automatically handles downloading and running the server - no build step required!

#### For Local Method:

1. **Build the server** (if not already done):
   ```bash
   npm run build
   ```

2. **Get the absolute path** to your built server:
   ```bash
   pwd
   # Copy the output and append '/dist/index.js'
   ```

3. **Configure your MCP client** with the server details
4. **Restart your MCP client** to load the new server configuration
5. **Test the connection** by trying to use one of the available tools

### Verification

Once configured, you should be able to use tools like:
- `get_current_user` - Test GitHub API connectivity
- `list_repositories` - List your GitHub repositories
- `get_pull_request_details` - Get detailed PR information

## Usage

### Running the Server

```bash
npm start
```

Or run directly:
```bash
node dist/index.js
```

### Available Tools

#### GitHub API Tools

**User Management:**
- `get_current_user` - Get details of the authenticated GitHub user

**Repository Management:**
- `list_repositories` - List repositories for the authenticated user

**Issue Management:**
- `create_issue` - Create a new issue in a repository

**Pull Request Management:**
- `create_pull_request` - Create a new pull request
- `update_pull_request_reviewers` - Add reviewers to an existing pull request

**Pull Request Information:**
- `get_pull_request_details` - Get comprehensive pull request information including reviews and comments
- `list_pull_request_reviews` - List all reviews for a pull request
- `list_pull_request_comments` - List all comments (review comments and general comments) for a pull request
- `list_pull_requests_with_details` - List pull requests with enhanced information including review summaries

**Comment Management:**
- `reply_to_comment` - Reply to a specific comment (issue comment or review comment)
- `get_comment` - Get details of a specific comment
- `update_comment` - Update the content of a comment
- `delete_comment` - Delete a comment

## Development

### Scripts

- `npm run build` - Build the TypeScript project
- `npm run watch` - Watch for changes and rebuild
- `npm run inspector` - Run the MCP inspector for debugging
- `npm start` - Start the server

### Project Structure

```
src/
├── index.ts                 # Main entry point
├── models/
│   └── github.ts           # GitHub API response types
├── services/
│   ├── config-service.ts   # Configuration management
│   ├── github-api.ts       # GitHub API client
│   ├── formatter-service.ts # Response formatting
│   └── github-server.ts    # Main MCP server
```

## GitHub Personal Access Token

To use this server, you'll need a GitHub Personal Access Token with appropriate permissions:

1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Generate a new token with the following scopes:
   - `repo` - Full control of private repositories
   - `user` - Read user profile data
   - `admin:org` - Full control of orgs and teams (if working with organizations)

## Examples

### Using with MCP Inspector

```bash
npm run inspector
```

This will start the MCP inspector where you can test the available tools.

### Example Tool Calls

**Get current user:**
```json
{
  "tool": "get_current_user",
  "arguments": {}
}
```

**Create an issue:**
```json
{
  "tool": "create_issue",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "title": "Bug report",
    "body": "Description of the bug",
    "labels": ["bug", "high-priority"]
  }
}
```

**Get detailed pull request information:**
```json
{
  "tool": "get_pull_request_details",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "pull_number": 123
  }
}
```

**List pull request reviews:**
```json
{
  "tool": "list_pull_request_reviews",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "pull_number": 123
  }
}
```

**List pull request comments:**
```json
{
  "tool": "list_pull_request_comments",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "pull_number": 123,
    "comment_type": "all"
  }
}
```

**List pull requests with review summaries:**
```json
{
  "tool": "list_pull_requests_with_details",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "state": "open"
  }
}
```

**Reply to a comment:**
```json
{
  "tool": "reply_to_comment",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "comment_id": 123456,
    "body": "Thanks for the feedback! I'll address this in the next commit.",
    "comment_type": "issue"
  }
}
```

**Get comment details:**
```json
{
  "tool": "get_comment",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "comment_id": 123456,
    "comment_type": "review"
  }
}
```

**Update a comment:**
```json
{
  "tool": "update_comment",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "comment_id": 123456,
    "body": "Updated comment content with additional information.",
    "comment_type": "issue"
  }
}
```

**Delete a comment:**
```json
{
  "tool": "delete_comment",
  "arguments": {
    "owner": "username",
    "repo": "repository",
    "comment_id": 123456,
    "comment_type": "issue"
  }
}
```

## Pull Request Features

This server provides comprehensive pull request management capabilities:

### Review Information
- Get all reviews for a pull request with reviewer details
- Review states (approved, changes requested, commented)
- Review timestamps and comments

### Comment Management
- **Review Comments**: Code-specific comments on lines of code
- **General Comments**: Discussion comments on the pull request
- Comment threads and discussions
- Comment timestamps and authors

### Enhanced Pull Request Listings
- Review status summaries (approvals, changes requested)
- Reviewer information and assignment status
- Comment counts and activity metrics

### Detailed Pull Request Information
- Complete pull request metadata
- All reviews with full details
- All comments (both review and general)
- Review summary statistics
- Merge status and conflict information

## Error Handling

The server includes comprehensive error handling for:
- GitHub API rate limits
- Network connectivity issues
- Authentication problems
- Invalid repository or pull request references

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK for server implementation
- `axios` - HTTP client for GitHub API calls
- `zod` - Schema validation
- `typescript` - TypeScript compiler

## Troubleshooting

### Common Issues

1. **Authentication Error**: Make sure your GitHub token is valid and has the required permissions
2. **Network Issues**: Check your internet connection and GitHub API status
3. **Rate Limiting**: GitHub API has rate limits; the server will handle these gracefully

### Debug Mode

Set the environment variable `DEBUG=1` for verbose logging:

```bash
DEBUG=1 npm start
