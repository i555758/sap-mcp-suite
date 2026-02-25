# SAP MCP Suite

Monorepo containing SAP MCP servers with custom enhancements.

## Installation

```bash
git clone https://github.wdf.sap.corp/D-A-Catalog-BR/sap-mcp-suite.git
cd sap-mcp-suite
npm run install:all
npm run build:all
```

## Structure

```
packages/
├── shared/           # Shared utilities (future)
└── servers/          # MCP servers (subtrees from upstream)
    ├── mcp-github/
    ├── playwright-mcp/
    ├── sap-auth-mcp/
    ├── sap-jira-mcp/
    ├── sap-msteams-mcp/
    └── sap-wiki-mcp/
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all SAP MCP servers |
| `npm run build:all` | Build all servers including playwright |
| `npm run build:playwright` | Build only playwright-mcp |
| `npm run install:all` | Install all dependencies |

## Upstream Sources

| Server | Upstream |
|--------|----------|
| mcp-github | github.tools.sap/sfsfmcp/mcp-github |
| sap-auth-mcp | github.tools.sap/sfsfmcp/sap-auth-mcp |
| sap-jira-mcp | github.tools.sap/sfsfmcp/sap-jira-mcp |
| sap-msteams-mcp | github.tools.sap/sfsfmcp/sap-msteams-mcp |
| sap-wiki-mcp | github.tools.sap/sfsfmcp/sap-wiki-mcp |
| playwright-mcp | github.com/microsoft/playwright-mcp |

## Syncing with Upstream

```bash
# Pull updates from upstream (example for wiki)
git subtree pull --prefix=packages/servers/sap-wiki-mcp https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git main --squash

# Pull updates for playwright
git subtree pull --prefix=packages/servers/playwright-mcp git@github.com:microsoft/playwright-mcp.git main --squash
```

## Local Enhancements

### sap-wiki-mcp
- `wiki_create_page` - Create new wiki pages
- `wiki_delete_page` - Delete wiki pages

### sap-msteams-mcp
- Message format support (text/html/markdown)

### mcp-github
- `get_repository` - Get repository details
