# SAP MS Teams MCP

[中文](./README-zh_CN.md)

> This server is part of [sap-mcp-suite](../../../README.md). See the root README for installation and setup.

An MCP (Model Context Protocol) server that provides access to Microsoft Teams via SAP SSO authentication.

## Overview

This MCP server enables AI assistants to interact with Microsoft Teams conversations, messages, meeting recordings, transcripts, and Microsoft Graph API (people search, calendar, org chart). It uses SAP SSO authentication through the `sap-auth-mcp` companion tool.

## Features

### Teams Chat API
- **Conversations**: List, search, and filter Teams conversations (with optional `search`, `since`, `until` params)
- **Messages**: Read, search, and filter messages in conversations (with optional `search`, `since`, `until` params)
- **Send & Reply**: Send new messages or threaded replies
- **Members**: Get conversation members
- **Private Chats**: Find 1:1 private chats by person name
- **Meeting Recordings**: Find meeting recordings and their transcripts
- **Transcripts**: Download and parse meeting transcripts

### Microsoft Graph API
- **People Search**: Search users by name/email, get contact info
- **Calendar**: Get calendar events (today/week/month/custom range)
- **Org Chart**: Get manager and direct reports
- **Profile**: Get current user's profile

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AUTH_COOKIE_DIR` | Path to cookie/token storage | `~/.sap-mcp` |
| `SAP_TEAMS_REGION` | Teams region (emea, amer, apac) | `emea` |
| `VERBOSE` | Enable verbose logging (true/false) | `false` |

## Usage

### 1. Authenticate with SAP SSO

First, use `sap-auth-mcp` to authenticate:

```
sap_authenticate(entry_url="https://teams.cloud.microsoft/v2/")
```

Tokens are stored in `~/.sap-mcp/auth.json` (shared across all SAP MCP servers).

### 2. Use Teams Tools

Once authenticated, you can use the following tools:

#### Teams Chat API Tools

```javascript
// List conversations (with optional search, time filtering)
teams_web_conversations({ limit: 20, search: "Project" })
teams_web_conversations({ since: "2026-02-01T00:00:00Z" })

// Get messages (with optional search, time filtering)
teams_web_messages({ conversationId: "19:xxx@thread.tacv2", limit: 50 })
teams_web_messages({ conversationId: "...", search: "deadline" })

// Send message / threaded reply
teams_web_send({ conversationId: "19:xxx@thread.tacv2", message: "Hello!" })
teams_web_reply({ conversationId: "...", parentMessageId: "...", message: "Thanks!" })

// Find private chat, get members
teams_web_find_private_chat({ query: "John Doe" })
teams_web_members({ conversationId: "..." })

// Meeting recordings & transcripts
teams_web_meeting_recordings({ conversationId: "..." })
teams_web_transcript({ url: "https://...asyncgw.teams.microsoft.com/.../views/transcript" })
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

### Teams Chat API Tools

| Tool | Description |
|------|-------------|
| `teams_web_conversations` | List/search conversations (supports `search`, `since`, `until`) |
| `teams_web_messages` | Get/search messages from a conversation (supports `search`, `since`, `until`) |
| `teams_web_send` | Send a new message to a conversation |
| `teams_web_reply` | Send a threaded reply to a message |
| `teams_web_find_private_chat` | Find 1:1 private chat with a person |
| `teams_web_members` | Get conversation members |
| `teams_web_meeting_recordings` | Find meeting recordings |
| `teams_web_transcript` | Get meeting transcript content |

### Graph API Tools

| Tool | Description |
|------|-------------|
| `teams_web_search_people` | Search users by name/email |
| `teams_web_calendar` | Get calendar events |
| `teams_web_manager` | Get current user's manager |
| `teams_web_direct_reports` | Get direct reports |
| `teams_web_my_profile` | Get current user's profile |

## Token Sources

All tokens are stored in `~/.sap-mcp/auth.json` (managed by sap-auth-mcp).

| Token | Audience | Used For |
|-------|----------|----------|
| Teams Chat API | `ic3.teams.office.com` | Conversations, Messages |
| Graph API | `graph.microsoft.com` | People, Calendar, Org Chart |

## Verbose Mode

Log file location: `~/.sap-mcp/logs/sap-msteams-mcp.log`
