# SAP MCP Suite

Monorepo containing MCP (Model Context Protocol) servers for SAP enterprise services.

## Quick Setup (Claude Code)

If you have Claude Code installed, open it in this folder and run this skill:

```
/install-mcps
```

This will build all servers and configure them globally for Claude Code.

## MCP Servers

| Server | Description | Auth |
|--------|-------------|------|
| sap-auth-mcp | SSO authentication for all SAP services | Browser SSO |
| sap-jira-mcp | Jira tickets, search, JQL queries | SAP SSO |
| sap-msteams-mcp | Teams chat, calendar, meetings, transcripts | OAuth2 |
| sap-wiki-mcp | Confluence wiki search and content | SAP SSO |
| mcp-github | GitHub API for tools.sap and wdf.sap.corp | PAT |
| playwright-mcp | Browser automation (used for auth flows) | - |

## Manual Installation

```bash
git clone https://github.wdf.sap.corp/D-A-Catalog-BR/sap-mcp-suite.git
cd sap-mcp-suite
npm run install:all
npm run build:all
```

### Global MCP Configuration

Create `~/.mcp.json` with absolute paths to the built servers:

```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "node",
      "args": ["/path/to/sap-mcp-suite/packages/servers/sap-auth-mcp/dist/index.js"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    },
    "sap-jira": {
      "command": "node",
      "args": ["/path/to/sap-mcp-suite/packages/servers/sap-jira-mcp/dist/index.js"],
      "env": {
        "JIRA_DOMAIN": "jira.tools.sap"
      }
    },
    "sap-msteams": {
      "command": "node",
      "args": ["/path/to/sap-mcp-suite/packages/servers/sap-msteams-mcp/dist/index.js"],
      "env": {
        "SAP_TEAMS_REGION": "emea"
      }
    },
    "sap-wiki": {
      "command": "node",
      "args": ["/path/to/sap-mcp-suite/packages/servers/sap-wiki-mcp/dist/index.js"]
    },
    "github-tools": {
      "command": "node",
      "args": ["/path/to/sap-mcp-suite/packages/servers/mcp-github/build/index.js"],
      "env": {
        "GITHUB_API_URL": "https://github.tools.sap/api/v3",
        "GITHUB_TOKEN": "your-pat-token",
        "GITHUB_DEFAULT_OWNER": "your-i-number"
      }
    },
    "github-wdf": {
      "command": "node",
      "args": ["/path/to/sap-mcp-suite/packages/servers/mcp-github/build/index.js"],
      "env": {
        "GITHUB_API_URL": "https://github.wdf.sap.corp/api/v3",
        "GITHUB_TOKEN": "your-pat-token",
        "GITHUB_DEFAULT_OWNER": "your-i-number",
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    },
    "playwright": {
      "command": "node",
      "args": ["/path/to/sap-mcp-suite/packages/servers/playwright-mcp/packages/playwright-mcp/index.js"]
    }
  }
}
```

Restart Claude Code after creating/updating this file.

## Authentication

After installation, authenticate with SAP services using `sap_authenticate`:

| Service | Entry URL |
|---------|-----------|
| Teams | `https://teams.cloud.microsoft/v2/` |
| Jira | `https://jira.tools.sap/` |
| Wiki | `https://wiki.one.int.sap/` |

Credentials are cached in `~/.claude/sap-auth.json` and auto-refresh when possible (Teams OAuth). SSO cookies expire after ~8 hours and require re-authentication.

## Structure

```
packages/
├── shared/
│   └── sap-auth/          # Shared authentication library
└── servers/
    ├── sap-auth-mcp/      # Authentication MCP server
    ├── sap-jira-mcp/      # Jira MCP server
    ├── sap-msteams-mcp/   # Teams MCP server
    ├── sap-wiki-mcp/      # Wiki MCP server
    ├── mcp-github/        # GitHub MCP server
    └── playwright-mcp/    # Browser automation (submodule)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all SAP MCP servers |
| `npm run build:all` | Build all servers including playwright |
| `npm run build:playwright` | Build only playwright-mcp |
| `npm run install:all` | Install all dependencies |

## Development

### Shared Auth Package (@anthropic/sap-auth)

All MCP servers use the shared auth package:

```typescript
import { AuthManager } from '@anthropic/sap-auth';

const auth = AuthManager.getInstance();
const creds = await auth.getCredentials('wiki');

// creds.type is 'cookie' or 'bearer'
// creds.value is the credential string
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SAP_AUTH_ACCOUNT` | SAP email for SSO (optional) |
| `SAP_TEAMS_REGION` | Teams region: amer, emea, apj |
| `JIRA_DOMAIN` | Jira domain (default: jira.tools.sap) |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `GITHUB_API_URL` | GitHub API endpoint |
| `BROWSER_PATH` | Custom Chrome/Edge path (optional) |

## Upstream Sources

| Server | Upstream |
|--------|----------|
| mcp-github | github.tools.sap/sfsfmcp/mcp-github |
| sap-auth-mcp | github.tools.sap/sfsfmcp/sap-auth-mcp |
| sap-jira-mcp | github.tools.sap/sfsfmcp/sap-jira-mcp |
| sap-msteams-mcp | github.tools.sap/sfsfmcp/sap-msteams-mcp |
| sap-wiki-mcp | github.tools.sap/sfsfmcp/sap-wiki-mcp |
| playwright-mcp | github.com/microsoft/playwright-mcp |

### Syncing with Upstream

```bash
# Pull updates from upstream (example for wiki)
git subtree pull --prefix=packages/servers/sap-wiki-mcp \
  https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git main --squash

# Pull updates for playwright
git subtree pull --prefix=packages/servers/playwright-mcp \
  git@github.com:microsoft/playwright-mcp.git main --squash
```
