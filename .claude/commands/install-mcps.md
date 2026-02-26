# Install SAP MCP Servers Globally

Interactive setup wizard that builds all MCP servers from this monorepo and configures them globally for Claude Code.

---

## Step 1: Verify Directory

Ensure we're in the sap-mcp-suite monorepo:

```bash
ls package.json packages/servers/sap-auth-mcp 2>/dev/null || echo "WRONG_DIR"
```

If "WRONG_DIR", STOP and tell the user to run from the sap-mcp-suite directory.

---

## Step 2: Build All MCP Servers

Check if servers are built:

```bash
ls packages/servers/sap-auth-mcp/dist/index.js packages/servers/sap-jira-mcp/dist/index.js packages/servers/sap-msteams-mcp/dist/index.js packages/servers/sap-wiki-mcp/dist/index.js packages/servers/mcp-github/build/index.js packages/servers/playwright-mcp/packages/playwright-mcp/index.js 2>/dev/null || echo "NEEDS_BUILD"
```

If any are missing, run the monorepo build:

```bash
npm run install:all && npm run build:all
```

Verify build succeeded by checking all dist folders exist.

---

## Step 3: Get User Configuration

Ask the user for the following information (they can type responses directly):

1. **GitHub tokens:**
   - github.tools.sap Personal Access Token (create at https://github.tools.sap/settings/tokens with scopes: repo, read:org)
   - github.wdf.sap.corp Personal Access Token (create at https://github.wdf.sap.corp/settings/tokens with scopes: repo, read:org)

2. **User info:**
   - GitHub username (I-number)
   - SAP email address

3. **Teams region:** Use AskUserQuestion with options: "amer", "emea", "apj"

---

## Step 4: Determine Absolute Paths

Get the absolute path to the repo:

```bash
pwd
```

Store this as REPO_PATH for building the server paths.

---

## Step 5: Check for Existing MCP Configuration

1. Check if `~/.claude.json` exists. If not, create it with `{}`
2. Read the file and parse it as JSON
3. If `mcpServers` key doesn't exist, create it as an empty object
4. Check for existing MCP servers that would conflict:
   - `sap-auth-mcp`
   - `sap-jira`
   - `sap-msteams`
   - `sap-wiki`
   - `github-tools`
   - `github-wdf`
   - `playwright`

5. If ANY of these servers already exist in `mcpServers`:
   - List which servers are already configured and their current paths
   - Ask the user using AskUserQuestion:
     **Question:** "Some MCP servers are already configured. Update them to use this sap-mcp-suite installation?"
     **Options:**
     - "Yes, update all to use this folder"
     - "No, keep existing configuration"

   - If user chooses "No", STOP and tell them:
     ```
     Keeping existing MCP configuration.
     To update later, run /install-mcps again.
     ```

---

## Step 6: Update ~/.claude.json

Merge the following server configs into `mcpServers` (replace $VARIABLES with actual values):

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
    "args": ["$REPO_PATH/packages/servers/mcp-github/build/index.js"],
    "env": {
      "GITHUB_API_URL": "https://github.tools.sap/api/v3",
      "GITHUB_TOKEN": "$GITHUB_TOOLS_TOKEN",
      "GITHUB_DEFAULT_OWNER": "$GITHUB_USERNAME"
    }
  },
  "github-wdf": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/mcp-github/build/index.js"],
    "env": {
      "GITHUB_API_URL": "https://github.wdf.sap.corp/api/v3",
      "GITHUB_TOKEN": "$GITHUB_WDF_TOKEN",
      "GITHUB_DEFAULT_OWNER": "$GITHUB_USERNAME",
      "NODE_TLS_REJECT_UNAUTHORIZED": "0"
    }
  },
  "playwright": {
    "command": "node",
    "args": ["$REPO_PATH/packages/servers/playwright-mcp/packages/playwright-mcp/index.js"]
  }
}
```

Write the updated JSON back to `~/.claude.json`

---

## Step 7: Restart and Resume

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

## Step 8: Verify Installation

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

If any fail with "No such tool":
1. Check `~/.claude.json` contains the `mcpServers` configuration
2. Verify the paths in the config point to existing files
3. Try restarting Claude Code again

---

## Step 9: Complete

```
============================================================
           SAP MCP Servers Installation Complete!
============================================================

All MCP servers are installed and authenticated.

You can now use these tools from any directory in Claude Code.

============================================================
```
