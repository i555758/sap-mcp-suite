# Sync with Upstream sfsfmcp Repos

Compare each MCP server against its original standalone sfsfmcp repo and port missing features.

---

## Step 1: Verify Directory

```bash
ls package.json packages/servers/sap-auth-mcp 2>/dev/null || echo "WRONG_DIR"
```

If "WRONG_DIR", STOP — must run from sap-mcp-suite root.

Store repo root path:

```bash
pwd
```

---

## Step 2: Upstream Registry

These are the upstream sfsfmcp repos and their local counterparts:

| Key | Upstream Repo URL | Local Package Path |
|-----|-------------------|--------------------|
| `sap-auth-mcp` | `https://github.tools.sap/sfsfmcp/sap-auth-mcp.git` | `packages/shared/sap-auth/` + `packages/servers/sap-auth-mcp/` |
| `sap-jira-mcp` | `https://github.tools.sap/sfsfmcp/sap-jira-mcp.git` | `packages/servers/sap-jira-mcp/` |
| `sap-msteams-mcp` | `https://github.tools.sap/sfsfmcp/sap-msteams-mcp.git` | `packages/servers/sap-msteams-mcp/` |
| `sap-wiki-mcp` | `https://github.tools.sap/sfsfmcp/sap-wiki-mcp.git` | `packages/servers/sap-wiki-mcp/` |
| `mcp-github` | `https://github.tools.sap/sfsfmcp/mcp-github.git` | `packages/servers/mcp-github/` |

---

## Step 3: Spawn Analysis Agents (Parallel)

Spawn one `general-purpose` agent per MCP server, all in a single message. Do NOT specify model.

Each agent clones the upstream repo, compares it against the local code, and returns a structured report of what's missing and whether it's relevant.

**Agent prompt template** (fill per MCP):

```
# Upstream Sync Analysis: {MCP_KEY}

## Task

Clone the upstream sfsfmcp repo and compare it against the sap-mcp-suite monorepo version. Identify functional changes in upstream that are NOT present locally.

## Setup

Clone upstream:
```bash
git clone {UPSTREAM_URL} /tmp/sfsfmcp-sync-{MCP_KEY}
```

Local code is at: {REPO_ROOT}/{LOCAL_PATH}

## What to Compare

1. **Git log**: Check ALL commits in the upstream repo. The import into sap-mcp-suite happened around Feb 25, 2026 — focus on commits after that date, but also scan older commits for features that may have been missed during import.

2. **Tool inventory**: List every MCP tool registered in upstream vs local. Note any tools present in upstream but missing locally.

3. **Functional diff**: For each source file, compare the functional behavior. Look for:
   - New features or tools
   - Bug fixes
   - Changed behavior (different parameters, different responses)
   - New configuration options or env vars

4. **What to IGNORE** (these are expected monorepo differences):
   - Import paths and module resolution differences
   - Auth architecture (upstream uses standalone auth, suite uses shared `sap-auth` package)
   - Error handling wrappers (`wrapToolHandler` vs manual try-catch)
   - Response helpers (`jsonResponse`/`textResponse` vs manual construction)
   - Logging (shared `mcp-logger` vs inline loggers)
   - File structure (handlers/ + api/ + services/ vs monolithic files)
   - Formatting, comments, variable names
   - package.json differences (versions, dependencies, scripts)
   - README and documentation files
   - The standalone launcher `bin/` scripts

## Output Format

Return a JSON block with your findings:

```json
{
  "mcp": "{MCP_KEY}",
  "upstream_commits_after_import": <number>,
  "findings": [
    {
      "id": "{MCP_KEY}-1",
      "title": "Short description of the change",
      "type": "feature|bugfix|improvement",
      "priority": "high|medium|low|skip",
      "description": "What this change does and why it matters",
      "upstream_location": "file:line or commit hash",
      "local_files_to_modify": ["list of files that would need changes"],
      "effort": "trivial|small|medium|large",
      "recommendation": "port|skip",
      "skip_reason": "Only if recommendation is skip — why it's not relevant"
    }
  ],
  "summary": "One-line summary: N findings, M recommended to port"
}
```

If there are NO findings worth reporting (upstream has no changes, or all changes are architectural differences already handled), return:

```json
{
  "mcp": "{MCP_KEY}",
  "upstream_commits_after_import": <number>,
  "findings": [],
  "summary": "Fully synced — no upstream changes to port"
}
```

After analysis, clean up:
```bash
rm -rf /tmp/sfsfmcp-sync-{MCP_KEY}
```
```

---

## Step 4: Collect and Present Findings

Wait for all agents to complete. Parse the JSON results from each.

### 4a. Aggregate

Build a combined list of all findings with `recommendation: "port"` across all MCPs. If the list is empty, report "All MCPs are fully synced with upstream" and STOP.

### 4b. Present to User

Use `AskUserQuestion` with `multiSelect: true`. Present each portworthy finding as an option:

- **Label**: `[{MCP_KEY}] {title}` (keep under 60 chars)
- **Description**: `{type} ({effort}) — {description}`

Group by MCP if there are many findings. Maximum 4 options per question — if there are more than 4 portworthy findings, split across multiple AskUserQuestion calls (up to 4 questions, each with up to 4 options).

Also show the "skip" findings as a summary table so the user knows what was evaluated:

```
Evaluated and skipped (not relevant for monorepo):
| MCP | Change | Reason |
|-----|--------|--------|
| ... | ...    | ...    |
```

---

## Step 5: Spawn Implementation Agents (Parallel)

For each finding the user selected, spawn a `general-purpose` agent. Do NOT specify model. All agents in a single message.

**Agent prompt template**:

```
# Implement Upstream Change: {FINDING_ID}

## Context

You are porting a change from the upstream sfsfmcp repo into the sap-mcp-suite monorepo.

**Change**: {title}
**Type**: {type}
**Description**: {description}
**Upstream reference**: {upstream_location}

## Setup

Clone the upstream repo for reference:
```bash
git clone {UPSTREAM_URL} /tmp/sfsfmcp-impl-{MCP_KEY}
```

## Local Code

The monorepo code is at: {REPO_ROOT}/{LOCAL_PATH}

Read `{REPO_ROOT}/DEVELOPMENT.md` for the monorepo patterns and conventions you MUST follow:
- Use `wrapToolHandler()` for tool registration
- Use `jsonResponse`/`textResponse`/`textError` for responses
- Use shared `sap-auth` for authentication
- Use `mcp-logger` for logging
- Follow the `handlers/` + `api/` + `services/` structure
- Use Zod schemas for tool parameters
- Use proper TypeScript types (no `any`)

## Task

1. Read the upstream implementation of this change
2. Read the relevant local files to understand the current state
3. Adapt the upstream change to fit the monorepo architecture and patterns
4. Make the changes to the local files
5. Verify TypeScript compilation:
   ```bash
   cd {REPO_ROOT} && npx tsc --noEmit -p {LOCAL_PATH}/tsconfig.json 2>&1 | head -30
   ```
6. If compilation fails, fix the errors and re-verify

## Cleanup

```bash
rm -rf /tmp/sfsfmcp-impl-{MCP_KEY}
```

## Return

Return: `Implemented {FINDING_ID}: {title} — {brief description of what was changed and which files were modified}`
```

---

## Step 6: Verify Build

After all implementation agents complete, run a full build:

```bash
npm run build:all 2>&1 | tail -20
```

If build fails, show the errors and attempt to fix them. If unfixable, report which changes caused issues.

---

## Step 7: Report

```
============================================================
           Upstream Sync Complete
============================================================

Analyzed: {N} upstream repos
Changes ported: {M}
  {list each ported change with MCP and title}

Skipped (not relevant): {K}
  {list each skipped change}

Build: {PASS/FAIL}

Changes are NOT committed. Review them with:
  git diff --stat

============================================================
```
