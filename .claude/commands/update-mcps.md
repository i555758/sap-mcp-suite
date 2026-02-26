# Update SAP MCP Servers

Updates all MCP servers from the remote repository and rebuilds them.

---

## Step 1: Verify Directory

Ensure we're in the sap-mcp-suite monorepo:

```bash
ls package.json packages/servers/sap-auth-mcp 2>/dev/null || echo "WRONG_DIR"
```

If "WRONG_DIR", STOP and tell the user to run from the sap-mcp-suite directory.

---

## Step 2: Check Git Status

Check for uncommitted changes that might conflict:

```bash
git status --porcelain
```

If there are uncommitted changes, warn the user and ask if they want to continue (changes might be overwritten or cause conflicts).

---

## Step 3: Fetch and Pull Latest Changes

```bash
git fetch origin && git pull origin main
```

Show the user what changed (if anything). If there are merge conflicts, STOP and tell the user to resolve them manually.

---

## Step 4: Rebuild All MCP Servers

```bash
npm run install:all && npm run build:all
```

If build fails, try to fix and if unsure show the error and STOP.

---

## Step 5: Detect New MCP Servers

Check which MCP servers exist in the repo:

```bash
ls -d packages/servers/*/dist/index.js packages/servers/mcp-github/build/index.js packages/servers/playwright-mcp/packages/playwright-mcp/index.js 2>/dev/null
```

Read the user's `~/.claude.json` and check `mcpServers` to see which ones are already configured.

Known MCP server mappings (repo folder -> config key):
- `sap-auth-mcp` -> `sap-auth-mcp`
- `sap-jira-mcp` -> `sap-jira`
- `sap-msteams-mcp` -> `sap-msteams`
- `sap-wiki-mcp` -> `sap-wiki`
- `mcp-github` -> `github-tools` and `github-wdf`
- `playwright-mcp` -> `playwright`

If any new MCP servers are detected that aren't in the user's config:
1. List the new servers
2. Tell the user to run `/install-mcps` to configure them (they may need to provide tokens/credentials)

---

## Step 6: Complete

If no new servers detected:

```
============================================================
           SAP MCP Servers Updated Successfully!
============================================================

All MCP servers have been updated and rebuilt.

Changes pulled from remote:
  [show git log --oneline -5 or "No new commits"]

NEXT STEPS:

  1. Exit Claude Code:
     /exit

  2. Resume to use the updated servers:
     claude -c

============================================================
```

If new servers detected:

```
============================================================
           SAP MCP Servers Updated Successfully!
============================================================

All MCP servers have been updated and rebuilt.

NEW MCP SERVERS DETECTED:
  - [list new servers]

To configure the new servers, run:
  /install-mcps

NEXT STEPS:

  1. Exit Claude Code:
     /exit

  2. Resume to use the updated servers:
     claude -c

============================================================
```
