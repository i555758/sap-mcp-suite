# SAP MCP Suite

Monorepo containing SAP MCP servers with custom enhancements.

## Structure

```
packages/
├── shared/           # Shared utilities (future)
└── servers/          # MCP servers (subtrees from upstream)
    ├── mcp-github/
    ├── sap-auth-mcp/
    ├── sap-jira-mcp/
    ├── sap-msteams-mcp/
    └── sap-wiki-mcp/
```

## Upstream Sources

All servers are subtrees from `github.tools.sap/sfsfmcp/`.

## Syncing with Upstream

```bash
# Pull updates from upstream (example for wiki)
git subtree pull --prefix=packages/servers/sap-wiki-mcp https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git main --squash
```

## Local Enhancements

### sap-wiki-mcp
- `wiki_create_page` - Create new pages
- `wiki_delete_page` - Delete pages

### sap-msteams-mcp
- Message format support (text/html/markdown)

### mcp-github
- (see git log for changes)
