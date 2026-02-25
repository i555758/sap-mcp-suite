# SAP MS Teams MCP

An MCP (Model Context Protocol) server that provides access to Microsoft Teams via SAP SSO authentication.

## Overview

This MCP server enables AI assistants to interact with Microsoft Teams conversations, messages, meeting recordings, transcripts, and Microsoft Graph API (people search, calendar, org chart). It uses SAP SSO authentication through the `sap-auth-mcp` companion tool.

## Features

### Teams Chat API (11 tools)
- **Conversations**: List, search, and filter Teams conversations
- **Messages**: Read, send, and search messages in conversations
- **Members**: Get conversation members
- **Meeting Recordings**: Find meeting recordings and their transcripts
- **Transcripts**: Download and parse meeting transcripts (VTT format)
- **Summarization**: Get messages prepared for AI summarization

### Microsoft Graph API (5 tools)
- **People Search**: Search users by name/email, get contact info
- **Calendar**: Get calendar events (today/week/month/custom range)
- **Org Chart**: Get manager and direct reports

## Prerequisites

- Node.js >= 20.0.0
- `sap-auth-mcp` for SAP SSO authentication

## Installation

### Remote Usage (Recommended)

```bash
npx -y git+https://github.tools.sap/sfsfmcp/sap-msteams-mcp.git
```

### Local Installation

```bash
git clone https://github.tools.sap/sfsfmcp/sap-msteams-mcp.git
cd sap-msteams-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_COOKIE_DIR` | Path to cookie/token storage | `~/.sap-auth-mcp` |
| `SAP_TEAMS_REGION` | Teams region (emea, amer, apac) | `emea` |
| `VERBOSE` | Enable verbose logging (true/false) | `false` |

### MCP Configuration

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "sap-msteams": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-msteams-mcp.git"],
      "env": {
        "AUTH_COOKIE_DIR": "~/.sap-auth-mcp",
        "SAP_TEAMS_REGION": "emea",
        "VERBOSE": "false"
      }
    }
  }
}
```

Or with local installation:

```json
{
  "mcpServers": {
    "sap-msteams": {
      "command": "node",
      "args": ["/path/to/sap-msteams-mcp/dist/index.js"],
      "env": {
        "AUTH_COOKIE_DIR": "~/.sap-auth-mcp",
        "SAP_TEAMS_REGION": "emea"
      }
    }
  }
}
```

## Usage

### 1. Authenticate with SAP SSO

First, use `sap-auth-mcp` to authenticate:

```
sap_authenticate(
  entry_url="https://teams.cloud.microsoft/v2/",
  store_path="~/.sap-auth-mcp"
)
```

This will create:
- `sap_cookies.json` - Teams Chat API token (from cookies)
- `sap_tokens.json` - Graph API token (from localStorage)

### 2. Use Teams Tools

Once authenticated, you can use the following tools:

#### Teams Chat API Tools

```javascript
// List Conversations
teams_web_conversations({ limit: 20, search: "Project" })

// Get Messages
teams_web_messages({ conversationId: "19:xxx@thread.tacv2", limit: 50 })

// Send Message
teams_web_send({ conversationId: "19:xxx@thread.tacv2", message: "Hello!" })

// Search Conversations
teams_web_search_conversation({ query: "Team Meeting" })

// Get Conversations by Time
teams_web_conversations_by_time({ since: "2026-02-01T00:00:00Z" })

// Search Messages
teams_web_search_messages({ conversationId: "...", query: "deadline" })

// Get Meeting Recordings
teams_web_meeting_recordings({ conversationId: "..." })

// Get Transcript
teams_web_transcript({ url: "https://...asyncgw.teams.microsoft.com/.../views/transcript" })

// Get Messages for Summary
teams_web_summarize({ conversationId: "...", messageCount: 100 })

// Find Private Chat
teams_web_find_private_chat({ personName: "John Doe" })

// Get Conversation Members
teams_web_members({ conversationId: "..." })
```

#### Graph API Tools

```javascript
// Search People
teams_web_search_people({ query: "John", limit: 10 })

// Get Calendar Events
teams_web_calendar({ range: "week" })  // today, week, month
teams_web_calendar({ startDate: "2026-02-01", endDate: "2026-02-28" })

// Get Manager
teams_web_manager()

// Get Direct Reports
teams_web_direct_reports({ limit: 50 })

// Get My Profile
teams_web_my_profile()
```

## Tools Reference

### Teams Chat API Tools (11)

| Tool | Description |
|------|-------------|
| `teams_web_conversations` | List recent conversations |
| `teams_web_messages` | Get messages from a conversation |
| `teams_web_send` | Send a message |
| `teams_web_search_conversation` | Search conversations by name/topic |
| `teams_web_conversations_by_time` | Get conversations in time range |
| `teams_web_search_messages` | Search messages in a conversation |
| `teams_web_meeting_recordings` | Find meeting recordings |
| `teams_web_transcript` | Get meeting transcript content |
| `teams_web_summarize` | Get messages for AI summarization |
| `teams_web_find_private_chat` | Find 1:1 private chat with a person |
| `teams_web_members` | Get conversation members |

### Graph API Tools (5)

| Tool | Description |
|------|-------------|
| `teams_web_search_people` | Search users by name/email |
| `teams_web_calendar` | Get calendar events |
| `teams_web_manager` | Get current user's manager |
| `teams_web_direct_reports` | Get direct reports |
| `teams_web_my_profile` | Get current user's profile |

## CLI Usage

```bash
# Show help
sap-msteams-mcp --help

# Show version
sap-msteams-mcp --version

# Start server
sap-msteams-mcp
```

## Verbose Mode

Enable verbose logging for debugging:

```bash
VERBOSE=true sap-msteams-mcp
```

Log file location: `~/.sap-mcp/logs/sap-msteams-mcp.log`

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode (dev)
npm run dev

# Start server
npm start
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Claude/LLM    │────▶│  sap-msteams-mcp │────▶│   Teams API     │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │                        │
                                 │               ┌─────────────────┐
                                 │──────────────▶│   Graph API     │
                                 │               └─────────────────┘
                                 ▼
                        ┌──────────────────┐
                        │   sap-auth-mcp   │
                        │ (sap_cookies.json│
                        │  sap_tokens.json)│
                        └──────────────────┘
```

## Token Sources

| Token | Source File | Audience | Used For |
|-------|-------------|----------|----------|
| Teams Chat API | `sap_tokens.json` | `ic3.teams.office.com` | Conversations, Messages |
| Graph API | `sap_tokens.json` | `graph.microsoft.com` | People, Calendar, Org Chart |

## License

MIT
