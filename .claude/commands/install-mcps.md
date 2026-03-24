# Install SAP MCP Servers Globally

Interactive setup wizard that builds all MCP servers from this monorepo and configures them globally for Claude Code.

Supports both fresh installs and updates to existing configurations.

---

## Step 1: Verify Prerequisites

### Check Node.js and npm

```bash
node --version 2>/dev/null || echo "NODE_MISSING"
npm --version 2>/dev/null || echo "NPM_MISSING"
```

If NODE_MISSING or NPM_MISSING, install Node.js using the appropriate package manager for the current platform (e.g., brew, winget, apt, etc.). After installation, verify with `node --version` and `npm --version`.

---

## Step 2: Verify Directory

Ensure we're in the sap-mcp-suite monorepo:

```bash
ls package.json packages/servers/sap-auth-mcp 2>/dev/null || echo "WRONG_DIR"
```

If "WRONG_DIR", STOP and tell the user to run from the sap-mcp-suite directory.

---

## Step 3: Build All MCP Servers

Check if servers are built:

```bash
ls packages/servers/sap-auth-mcp/dist/index.js packages/servers/sap-jira-mcp/dist/index.js packages/servers/sap-msteams-mcp/dist/index.js packages/servers/sap-wiki-mcp/dist/index.js packages/servers/mcp-github/dist/index.js packages/servers/playwright-mcp/packages/playwright-mcp/cli.js 2>/dev/null || echo "NEEDS_BUILD"
```

If any are missing, run the monorepo build:

```bash
npm run install:all && npm run build:all
```

Verify all dist files exist:

```bash
ls packages/servers/sap-auth-mcp/dist/index.js \
   packages/servers/sap-jira-mcp/dist/index.js \
   packages/servers/sap-msteams-mcp/dist/index.js \
   packages/servers/sap-wiki-mcp/dist/index.js \
   packages/servers/mcp-github/dist/index.js \
   packages/servers/playwright-mcp/packages/playwright-mcp/cli.js
```

All six must be present before proceeding.

---

## Step 4: Check Existing Configuration

Read `~/.claude.json` and extract existing MCP configuration values:

```bash
cat ~/.claude.json 2>/dev/null || echo "{}"
```

Extract existing values from mcpServers if they exist:
- `EXISTING_EMAIL` from `sap-auth-mcp.env.SAP_AUTH_ACCOUNT`
- `EXISTING_TEAMS_REGION` from `sap-msteams.env.SAP_TEAMS_REGION`
- `EXISTING_GITHUB_USERNAME` from `github-tools.env.GITHUB_DEFAULT_OWNER`

---

## Step 5: Get User Configuration (Only Missing Values)

**Only ask for values that are NOT already configured.**

Show the user what's already configured:
```
Existing configuration detected:
  - SAP Email: [value or "not set"]
  - Teams Region: [value or "not set"]
  - GitHub Username: [value or "not set"]
```

For any missing values, ask the user:

1. **If SAP email is missing:**
   - Ask for SAP email address (e.g., name@sap.com)

2. **If GitHub username is missing:**
   - Ask for GitHub username (I-number)

3. **If Teams region is missing:**
   - Use AskUserQuestion with options: "amer", "emea", "apj"

Note: GitHub and Jira authentication tokens are set up on first use — the AI will guide you through creating a PAT when needed. No tokens need to be configured here.

If ALL values are already configured, tell the user and ask if they want to reconfigure anything. If not, skip to Step 7.

---

## Step 6: Determine Absolute Paths

Get the absolute path to the repo:

```bash
pwd
```

Store this as REPO_PATH for building the server paths.

---

## Step 7: Update ~/.claude.json

1. Check if `~/.claude.json` exists. If not, create it with `{}`
2. Read the file and parse it as JSON
3. If `mcpServers` key doesn't exist, create it as an empty object
4. Replace/add the following server configs in `mcpServers`
5. Use EXISTING values where available, NEW values where provided
6. If the user has any MCP server which conflict with these, replace. This is the canonical source

```json
{
  "sap-auth-mcp": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/sap-auth-mcp/dist/index.js"],
    "env": {
      "SAP_AUTH_ACCOUNT": "$USER_EMAIL"
    }
  },
  "sap-jira": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/sap-jira-mcp/dist/index.js"],
    "env": {
      "JIRA_DOMAIN": "jira.tools.sap"
    }
  },
  "sap-msteams": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/sap-msteams-mcp/dist/index.js"],
    "env": {
      "SAP_TEAMS_REGION": "$TEAMS_REGION"
    }
  },
  "sap-wiki": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/sap-wiki-mcp/dist/index.js"]
  },
  "github-tools": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/mcp-github/dist/index.js"],
    "env": {
      "GITHUB_API_URL": "https://github.tools.sap/api/v3",
      "GITHUB_DEFAULT_OWNER": "$GITHUB_USERNAME"
    }
  },
  "github-wdf": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/mcp-github/dist/index.js"],
    "env": {
      "GITHUB_API_URL": "https://github.wdf.sap.corp/api/v3",
      "GITHUB_DEFAULT_OWNER": "$GITHUB_USERNAME",
      "NODE_TLS_REJECT_UNAUTHORIZED": "0"
    }
  },
  "playwright": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/playwright-mcp/packages/playwright-mcp/cli.js"]
  }
}
```

Write the updated JSON back to `~/.claude.json`

---

## Step 8: Restart and Resume

Tell the user:

```
============================================================
           SAP MCP Servers Configuration Complete!
============================================================

The following MCP servers have been configured in ~/.claude.json:

  - sap-auth-mcp     (SAP SSO authentication)
  - sap-jira         (Jira ticket management)
  - sap-msteams      (Microsoft Teams)
  - sap-wiki         (SAP Wiki search)
  - github-tools     (github.tools.sap)
  - github-wdf       (github.wdf.sap.corp)
  - playwright       (Browser automation)

NEXT STEPS:

  1. Exit Claude Code:
     /exit

  2. Resume this session (run from THIS folder):
     claude -c

============================================================
```

STOP here. The user must restart and resume.

---

## Step 9: Verify Installation

After user resumes, verify all MCP servers are working by calling a tool from each:

1. **sap-auth-mcp:**
```
mcp__sap-auth-mcp__sap_get_cookie_info()
```

2. **sap-jira:**
```
mcp__sap-jira__jql_examples()
```

3. **sap-msteams:**
```
mcp__sap-msteams__teams_web_my_profile()
```

4. **github-tools:**
```
mcp__github-tools__get_current_user()
```

5. **github-wdf:**
```
mcp__github-wdf__get_current_user()
```

6. **sap-wiki:**
```
mcp__sap-wiki__cql_examples()
```

7. **playwright:**
```
mcp__playwright__browser_tabs({ action: "list" })
```

If any fail with "No such tool":
1. Check `~/.claude.json` contains the `mcpServers` configuration
2. Verify the paths in the config point to existing files
3. Try restarting Claude Code again

---

## Step 10: Complete

```
============================================================
           SAP MCP Servers Installation Complete!
============================================================

All MCP servers are installed and authenticated.

You can now use these tools from any directory in Claude Code.

============================================================
```

