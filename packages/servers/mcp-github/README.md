# GitHub MCP Server

A Model Context Protocol server for GitHub API operations with comprehensive pull request management capabilities.

> This server is part of [sap-mcp-suite](../../README.md). See the root README for installation and setup.

## Features

### GitHub API Integration
- **User Management**: Get current user details and user information
- **Repository Management**: List, create, and manage repositories
- **Issue Management**: Create and manage GitHub issues
- **Pull Request Management**: Create and manage pull requests with detailed information
- **Pull Request Reviews**: Get comprehensive review information and comments
- **Pull Request Comments**: Access both code review comments and general discussion comments

## Environment Variables

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | Your GitHub Personal Access Token. If set, the token is persisted to `~/.sap-mcp/auth.json` and subsequent runs don't need it in the environment. |
| `GITHUB_API_URL` | GitHub API endpoint. Use `https://api.github.com` for GitHub.com or `https://your-domain/api/v3` for GitHub Enterprise. |
| `GITHUB_DEFAULT_OWNER` | Your default GitHub username or organization. |

## Available Tools

### GitHub API Tools

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

## Example Tool Calls

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

## Troubleshooting

### Common Issues

1. **Authentication Error**: Make sure your GitHub token is valid and has the required permissions
2. **Network Issues**: Check your internet connection and GitHub API status
3. **Rate Limiting**: GitHub API has rate limits; the server will handle these gracefully

### Debug Mode

Set the environment variable `DEBUG=1` for verbose logging.

## GitHub Personal Access Token

To use this server, you'll need a GitHub Personal Access Token with appropriate permissions:

1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Generate a new token with the following scopes:
   - `repo` - Full control of private repositories
   - `user` - Read user profile data
   - `admin:org` - Full control of orgs and teams (if working with organizations)
