# JQL Examples for SAP Jira

This file contains static JQL examples and fallback metadata for the SAP Jira MCP server.

## JQL Examples

### Recent tickets assigned to me
**JQL:** `assignee = currentUser() ORDER BY updated DESC`
**Description:** Find all tickets assigned to you, sorted by most recently updated

### Open issues in PTCH project
**JQL:** `project = PTCH AND status IN (Open, "In Progress") ORDER BY priority DESC`
**Description:** Find open issues in PTCH project, sorted by priority

### High priority tickets created recently
**JQL:** `priority = High AND created >= -7d ORDER BY created DESC`
**Description:** Find high priority tickets created in the last 7 days

### Production patches needing attention
**JQL:** `type = "Production Patch" AND status NOT IN (Closed, Resolved) ORDER BY updated DESC`
**Description:** Find active production patches that need attention

### Tickets updated in the last 30 days
**JQL:** `updated >= -30d AND assignee = currentUser() ORDER BY updated DESC`
**Description:** Find your tickets that have been updated in the last 30 days

### Search tickets with specific text
**JQL:** `summary ~ "keyword" OR description ~ "keyword" ORDER BY updated DESC`
**Description:** Find tickets containing specific keywords in summary or description

### My team's high priority work
**JQL:** `assignee IN (currentUser(), membersOf("your-team")) AND priority IN (High, "Very High") ORDER BY updated DESC`
**Description:** Find high priority tickets assigned to me or my team members

### Recently resolved tickets
**JQL:** `status IN (Resolved, Closed) AND updated >= -7d ORDER BY resolved DESC`
**Description:** Find tickets that were resolved or closed in the last 7 days

## Fallback Metadata

### Top Projects
- PTCH
- EAS
- WSM
- COM
- CPDNASECURITY
- WFSTIME

### Common Statuses
- Open
- In Progress
- Closed
- Resolved
- To Do
- Done

### Priorities
- Very High
- High
- Medium
- Low

### Issue Types
- Bug
- Production Patch
- Story
- Task
- Epic
- User Story