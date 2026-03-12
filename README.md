# SAP MCP Suite

Monorepo containing MCP (Model Context Protocol) servers for SAP enterprise services.

## Installation (Claude Code)

Clone the repository and open Claude Code in the folder:

```bash
git clone https://github.wdf.sap.corp/D-A-Catalog-BR/sap-mcp-suite.git
cd sap-mcp-suite
claude
```

Then run the install command:

```
/install-mcps
```

This will build all servers and configure them globally for Claude Code. The command detects existing configurations and only asks for missing values.

### You're good to go!

Just ask Claude to use any MCP and authentication should be handled automatically.

## Updating

To pull the latest changes and rebuild:

```
/update-mcps
```

This fetches updates from the remote repository, rebuilds all servers, and detects if any new MCP servers were added.

## MCP Servers

| Server | Description | Auth |
|--------|-------------|------|
| sap-auth-mcp | SSO authentication for all SAP services | Browser SSO |
| sap-jira-mcp | Jira tickets, search, JQL queries | SAP SSO |
| sap-msteams-mcp | Teams chat, calendar, meetings, transcripts | OAuth2 |
| sap-wiki-mcp | Confluence wiki search and content | SAP SSO |
| mcp-github | GitHub API for tools.sap and wdf.sap.corp | PAT (via sap-auth) |
| playwright-mcp | Browser automation (used for auth flows) | - |

---
> Originally forked from the [sfsfmcp](https://github.tools.sap/sfsfmcp) MCP servers.