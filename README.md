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

### Updating

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

## Authentication

After installation, authenticate with SAP services using `sap_authenticate`:

| Service | Entry URL |
|---------|-----------|
| Teams | `https://teams.cloud.microsoft/v2/` |
| Jira | `https://jira.tools.sap/` |
| Wiki | `https://wiki.one.int.sap/` |
| GitHub (tools) | `https://github.tools.sap/` |
| GitHub (wdf) | `https://github.wdf.sap.corp/` |

Credentials are cached in `~/.sap-mcp/auth.json` and auto-refresh when possible (Teams OAuth). SSO cookies expire after ~8 hours and require re-authentication. GitHub PATs are stored centrally and don't expire.

## Structure

```
packages/
├── shared/
│   ├── sap-auth/          # Shared authentication library
│   ├── mcp-utils/         # Shared MCP utilities (responses, errors, helpers)
│   └── mcp-logger/        # Shared logging library
└── servers/
    ├── sap-auth-mcp/      # Authentication MCP server
    ├── sap-jira-mcp/      # Jira MCP server
    ├── sap-msteams-mcp/   # Teams MCP server
    ├── sap-wiki-mcp/      # Wiki MCP server
    ├── mcp-github/        # GitHub MCP server
    └── playwright-mcp/    # Browser automation (submodule)
```

### Server Source Structure

All servers follow a consistent structure:

```
src/
├── index.ts          # Entry point (thin)
├── server.ts         # MCP server class
├── types.ts          # Type definitions
├── handlers/         # Tool handlers by domain
│   ├── index.ts      # registerAllHandlers()
│   └── *-handlers.ts
├── api/              # External API clients
│   └── *.ts
└── services/         # Internal services (auth, config)
    └── *.ts
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all SAP MCP servers |
| `npm run build:all` | Build all servers including playwright |
| `npm run build:playwright` | Build only playwright-mcp |
| `npm run install:all` | Install all dependencies |

## Development

### Shared Auth Package (sap-auth)

All MCP servers use the shared auth package:

```typescript
import { AuthManager } from 'sap-auth';

const auth = AuthManager.getInstance();
const creds = await auth.getCredentials('wiki');

// creds.type is 'cookie' or 'bearer'
// creds.value is the credential string
```

### Shared Utilities (mcp-utils)

Common MCP utilities for all servers:

```typescript
import {
  jsonResponse, textResponse, textError,  // Response helpers
  extractErrorMessage, formatError,        // Error helpers
  wrapToolHandler,                          // Tool wrapper with error handling
  delay,                                    // Async delay helper
  getParam, getRequiredParam,              // Parameter extraction
  formatDate, formatDateTime,              // Date formatting
} from 'mcp-utils';

// Wrap tool handlers with consistent error handling
server.registerTool("my_tool", schema,
  wrapToolHandler(
    (args) => handleMyTool(args),
    { isAuthError, onAuthError: formatAuthError }
  )
);
```

### Shared Logger (mcp-logger)

Consistent logging across servers:

```typescript
import { createLogger } from 'mcp-logger';

const log = createLogger('my-server');
log.info('Server started');
log.debug('Debug info');  // Only when VERBOSE=true
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
