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

## Step 2: Check for Remote Updates

Fetch from remote and check if there are any incoming changes:

```bash
git fetch origin
git rev-list HEAD..origin/main --count
```

If the count is 0, there are no updates available. Skip to Step 6 with "Already up to date" message.

If there are updates, show what's coming:

```bash
git log HEAD..origin/main --oneline
```

---

## Step 3: Check Local Changes and Predict Conflicts

Check for uncommitted local changes:

```bash
git status --porcelain
```

If there are local changes, check if they would conflict with incoming changes:

```bash
git diff --name-only HEAD..origin/main
```

Compare the two lists:
- If any files appear in BOTH lists (local changes AND incoming changes), warn about potential conflicts and ask the user how to proceed (stash, commit, or abort)
- If local changes don't overlap with incoming changes, proceed safely

---

## Step 4: Pull Changes

```bash
git pull origin main
```

If merge conflicts occur, STOP and tell the user to resolve them manually.

---

## Step 5: Rebuild and Check for New Servers

Rebuild all servers:

```bash
npm run install:all && npm run build:all
```

If build fails, show the error and STOP.

Check for new MCP servers not yet configured in `~/.claude.json`:

Known MCP server mappings (repo folder -> config key):
- `sap-auth-mcp` -> `sap-auth-mcp`
- `sap-jira-mcp` -> `sap-jira`
- `sap-msteams-mcp` -> `sap-msteams`
- `sap-wiki-mcp` -> `sap-wiki`
- `mcp-github` -> `github-tools` and `github-wdf`
- `playwright-mcp` -> `playwright`

---

## Step 6: Complete

**If no updates available (already up to date):**

```
============================================================
              SAP MCP Servers Already Up to Date
============================================================

No updates available from remote.

Your MCP servers are already running the latest version.
============================================================
```

STOP here. No restart needed.

**If updates were pulled:**

```
============================================================
           SAP MCP Servers Updated Successfully!
============================================================

Changes pulled:
  [show the commits that were pulled]

NEXT STEPS:

  1. Exit Claude Code:
     /exit

  2. Resume to use the updated servers:
     claude -c

============================================================
```

**If new servers were detected:**

Add to the message:

```
NEW MCP SERVERS DETECTED:
  - [list new servers]

To configure the new servers, run:
  /install-mcps
```
