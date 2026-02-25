# SAP Universal Authentication MCP Server

English | [中文](https://github.tools.sap/sfsfmcp/sap-auth-mcp/blob/main/README-zh_CN.md)

A Model Context Protocol (MCP) server that provides centralized SAP authentication services for other MCP modules. This server handles complex SAP Single Sign-On (SSO) flows using automated browser authentication and provides standardized cookie management for downstream services.

## Contacts
Please connect with [Xeric Wei on Teams](https://teams.microsoft.com/l/chat/0/0?users=xeric.wei@sap.com) if you have any question.

## Overview

The SAP Auth MCP is designed as a **shared authentication service** that other MCP modules can utilize to handle SAP authentication. Instead of each MCP implementing its own authentication logic, they can delegate this responsibility to this centralized service.

In principle, this MCP will invoke a browser and attempt to automate the authentication process. When silent mode cannot obtain valid cookies, it will automatically fallback to explicit browser manual interaction mode.

## Key Features

- **Hybrid Authentication**: Combines headless and visible browser automation for optimal user experience
- **Centralized Cookie Management**: Standardized cookie storage and sharing across MCP modules
- **Multi-Domain Support**: Handles authentication for various SAP systems (Jira, Wiki, etc.)
- **Persistent Sessions**: ~24*7 hours cookie persistence
- **Error Standardization**: Consistent error responses to guide AI clients

## Quick Start

### Prerequisites
- Please ensure your environment has Node.js toolkit, node version >= 20.0
- Note that this MCP has no value when used alone, it is designed to work with MCP servers like sap-jira-mcp and sap-wiki-mcp
- Please ensure you can normally authenticate and log into SAP services like Jira and Wiki on your running device
- Not recommended to run on devices that haven't undergone SAP enrollment (devices not managed by SAP IT)

### ⚡️ Remote Usage with npx (Recommended) ⚡️

The easiest way to get started:

First verify that npx mode can normally access the remote repo and run:
```bash
npx -y git+https://github.tools.sap/sfsfmcp/sap-auth-mcp.git --version
```

If you see a version display in the terminal >= 1.1.0, it means npx mode can execute normally. Note that the first time may involve installing dependencies and compilation, which will be slower than subsequent executions.

## AI Client Setup

#### Using npx (Recommended):

```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-auth-mcp.git"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    }
  }
}
```

At this point, sap-auth-mcp can run normally in your client. Please try using other MCP servers that depend on this MCP, such as sap-wiki-mcp and sap-jira-mcp for running and testing.

If you find that the npx method has issues, or you don't want to run in this mode, or you want to have deeper control over this project by cloning the local repo, then please proceed with local installation:

### Local Installation

```bash
git clone https://github.tools.sap/sfsfmcp/sap-auth-mcp.git
cd sap-auth-mcp
npm install
npm run build
```

#### Using local installation:

```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "node",
      "args": ["/path/to/sap-auth-mcp/dist/index.js"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    }
  }
}
```

### Configuration Notes

- Replace `/path/to/sap-auth-mcp/` with the actual absolute path to your installation
- The `SAP_AUTH_ACCOUNT` environment variable is optional but recommended
- The `IN_PRIVATE` environment variable enables incognito mode for testing, generally used for debugging, optional
- The `VISIBLE_MODE` environment variable enables visible browser for debugging automation, generally used for debugging, optional
- If running locally after cloning repo, ensure the `dist/index.js` file exists (run `npm run build` if needed)
- Some clients may need to refresh MCP or restart your AI client after configuration changes

### Verification

After configuration, verify the MCP is loaded by asking your AI client:
```
"What MCP tools are available?"
```

You should see the SAP Auth MCP tools listed:
- `sap_authenticate`
- `sap_make_request`
- `sap_get_cookie_info`
- `sap_clear_cookies`

## Environment Configuration

### Environment Variables

- `SAP_AUTH_ACCOUNT` (optional): Specific SAP email account to use for authentication
  - If not set, will auto-select the first available account
- `IN_PRIVATE` (optional): Enable private/incognito mode for browser sessions
  - Set to `true` to enable incognito mode for testing without cached data
  - Default: `false` (normal browser mode)
- `VISIBLE_MODE` (optional): Enable visible browser for debugging automation
  - Set to `true` to run automation in visible browser (you can watch the process)
  - Default: `false` (hybrid mode with headless first, visible fallback)
- `VERBOSE` (optional): Enable detailed logging for debugging
  - Set to `true` to enable verbose logging to `~/.sap-mcp/logs/sap-auth-mcp.log`
  - Logs include detailed authentication flow, browser actions, cookie/token operations
  - Default: `false` (minimal console output)
- `BROWSER_PATH` (optional): Specify your browser path, currently tested with Chrome and Edge browsers

### Private Mode Usage

Set `IN_PRIVATE=true` when you want to:
- **Test authentication flow** without cached browser data
- **Debug authentication issues** in a clean browser environment
- **Simulate fresh user experience** without stored cookies or session data
- **Isolate authentication problems** from existing browser state

**Note**: Private mode disables cookie persistence between browser sessions, which may require re-authentication more frequently.

### Visible Mode Usage

Set `VISIBLE_MODE=true` when you want to:
- **Debug authentication automation** by watching the automation process in a visible browser
- **Understand what the automation is doing** step by step
- **Troubleshoot authentication issues** by observing browser behavior
- **Develop and test new authentication flows** with visual feedback
- **Verify automation works correctly** before deploying in headless mode

**Note**: Visible mode runs the same automation logic but in a visible browser, allowing you to watch and understand the process. If automation fails, you can still complete authentication manually in the same browser window.

### Verbose Mode Usage

Set `VERBOSE=true` when you want to:
- **Debug authentication issues** with detailed step-by-step logs
- **Understand the authentication flow** by reviewing log files
- **Troubleshoot cookie/token extraction** problems
- **Report bugs** with comprehensive diagnostic information

**Log Location**: `~/.sap-mcp/logs/sap-auth-mcp.log`

**Log Contents**:
- Authentication flow steps with timestamps
- Browser navigation and URL changes
- Account selection and element detection
- Cookie retrieval and storage details
- Token extraction from localStorage
- Error details with stack traces

**Example Configuration**:
```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "npx",
      "args": ["-y", "git+https://github.tools.sap/sfsfmcp/sap-auth-mcp.git"],
      "env": {
        "SAP_AUTH_ACCOUNT": "your.email@sap.com",
        "VERBOSE": "true"
      }
    }
  }
}
```

**Note**: Verbose mode creates detailed log files that may grow over time. Consider disabling it after debugging is complete.

### System Requirements

- **Cross-Platform Support**: Windows, macOS, and Linux
- Node.js 20+
- Browser: **Microsoft Edge** (Windows), Google Chrome (macOS/Linux), or Chromium
- Network access to SAP systems

### Browser Support & Platform-Specific Recommendations

#### 🪟 **Windows**
- **Recommended**: Microsoft Edge (automatically detected)
- **Default paths** checked in order:
  1. `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
  2. `C:\Program Files\Microsoft\Edge\Application\msedge.exe`
  3. Chrome paths (fallback)
- **Why Edge?**: Due to SAP Jira's authentication restrictions, Edge provides better compatibility than Chrome on Windows

#### 🍎 **macOS**
- **Default**: Google Chrome
- **Path**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

#### 🐧 **Linux**
- **Supported browsers**: Chrome, Chromium, Chrome Stable
- **Default paths** checked in order:
  1. `/usr/bin/google-chrome`
  2. `/usr/bin/google-chrome-stable`
  3. `/usr/bin/chromium-browser`
  4. `/usr/bin/chromium`
  5. `/snap/bin/chromium`
  6. `/opt/google/chrome/chrome`

### Custom Browser Path

Override the default browser selection with the `BROWSER_PATH` environment variable:

```json
{
  "mcpServers": {
    "sap-auth-mcp": {
      "command": "node",
      "args": ["/path/to/sap-auth-mcp/dist/index.js"],
      "env": {
        "BROWSER_PATH": "/custom/path/to/browser",
        "SAP_AUTH_ACCOUNT": "your.email@sap.com"
      }
    }
  }
}
```

**Examples:**
- Windows Chrome: `"BROWSER_PATH": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`
- macOS Brave: `"BROWSER_PATH": "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"`
- Linux Chromium: `"BROWSER_PATH": "/usr/bin/chromium-browser"`

### Long Running Server Behavior

This MCP server is designed as a **long running process** that remains active throughout your AI client session:

- **Persistent Process**: The server starts when your AI client launches and continues running until the client is closed
- **Session Management**: Authentication state (`this.auth` instance) is maintained across multiple tool calls
- **Performance Benefits**: Avoids initialization overhead on each authentication request
- **Resource Efficiency**: Browser instances are closed after authentication, only session cookies are retained
- **Background Operation**: Server runs silently in the background, ready to respond to authentication requests

**Process Lifecycle:**
1. **Startup**: AI client automatically starts the MCP server process
2. **Ready State**: Server listens for tool calls via stdio transport
3. **Tool Execution**: Handles authentication requests as needed
4. **Persistent**: Remains active for the entire AI client session
5. **Shutdown**: Process terminates only when AI client is closed

**Resource Management:**
- **Memory Usage**: Minimal Node.js process footprint (~30-50MB)
- **Browser Instances**: Automatically closed after authentication completion
- **Cookie Storage**: File-based storage, not held in memory
- **Network Connections**: Only active during authentication and API requests
- **Process Monitoring**: Can be monitored via standard system tools (Activity Monitor, `ps`, etc.)

## Available MCP Tools

### `sap_authenticate`

Performs SAP system authentication and saves cookies to specified location.

**Parameters:**
- `entry_url` (required): The SAP system entry URL (e.g., `https://jira.tools.sap/`, `https://wiki.one.int.sap/`)
- `store_path` (required): Directory path where `sap_cookies.json` will be saved

**Example:**
```json
{
  "tool": "sap_authenticate",
  "arguments": {
    "entry_url": "https://jira.tools.sap/",
    "store_path": "/path/to/jira-mcp/cookies"
  }
}
```

### `sap_make_request`

Makes authenticated HTTP requests using stored session cookies.

**Parameters:**
- `url` (required): Target URL for the request
- `method` (optional): HTTP method (default: GET)
- `headers` (optional): Additional headers
- `body` (optional): Request body for POST/PUT requests

### `sap_get_cookie_info`

Retrieves information about stored authentication cookies.

**Parameters:**
- `store_path` (optional): Directory path to check (uses default if not provided)

### `sap_clear_cookies`

Clears stored authentication cookies from specified location.

**Parameters:**
- `store_path` (optional): Directory path to clear (uses default if not provided)

## Browser Automation Details

### Phase 1: Headless Authentication

**Email Account Selection (Classic Flow):**
- Attempts to automatically click email account selection from list
- Handles basic SSO redirects
- Works for simple authentication flows

**Email Input Field Handling (NEW):**
- Detects and auto-fills `input[type="email"]` fields
- Uses `SAP_AUTH_ACCOUNT` environment variable for email
- Automatically finds and clicks submit buttons
- Supports various Microsoft login page variations

**Microsoft Authenticator Number Matching (NEW):**
- Detects Authenticator number matching requirements
- Extracts authentication number from `#idRemoteNGC_DisplaySign` element
- Provides clear user instructions with service-specific guidance
- Waits up to 1 minute for user approval in Authenticator app
- Automatically detects page refresh when approval completes
- Falls back to manual mode on timeout

### Phase 2: Visible Browser Fallback
- Launches visible Chrome when user interaction is required
- Handles MFA, certificate selection, complex prompts
- Supports complex authentication flows not handled automatically
- Automatically captures cookies once authentication completes

### Browser Configuration
- Kerberos/NTLM authentication support
- Certificate store integration
- SAP domain whitelisting
- Proxy auto-detection

## Troubleshooting

### Common Issues

1. **Authentication Timeout**: Visible browser authentication has 6-minute timeout
2. **Chrome Path**: Hardcoded for macOS, may need adjustment for other systems
3. **Network Issues**: Check SAP domain accessibility and proxy settings
4. **Cookie Permissions**: Ensure write permissions for `store_path` directories

### New Authentication Features Issues

5. **Email Auto-fill Not Working**:
   - Ensure `SAP_AUTH_ACCOUNT` environment variable is set
   - Check that the page contains `input[type="email"]` elements
   - Verify network connectivity to Microsoft login pages

6. **Authenticator Number Not Detected**:
   - Check if `#idRemoteNGC_DisplaySign` element exists on the page
   - Verify the element contains a numeric value
   - Some pages may use alternative selectors (automatically checked)

7. **Authenticator Timeout Issues**:
   - Default timeout is 1 minute for number matching
   - Ensure Microsoft Authenticator app is installed and configured
   - Check that the correct service account is set up in Authenticator
   - System will automatically fall back to manual mode on timeout

8. **Submit Button Not Found**:
   - System checks multiple button types: `input[type="submit"]`, `button[type="submit"]`
   - Also looks for common Microsoft button IDs and text patterns
   - Manual fallback will handle unusual button configurations

### Long Running Process Issues

9. **Server Not Responding**: Check if MCP server process is still running
   ```bash
   # Check for running sap-auth-mcp processes
   ps aux | grep "sap-auth-mcp"
   ```

10. **Memory Issues**: Monitor process memory usage over time
   ```bash
   # Monitor memory usage (macOS)
   top -pid $(pgrep -f "sap-auth-mcp")
   ```

11. **Zombie Browser Processes**: Ensure browser instances are properly closed
   ```bash
   # Check for lingering Chrome processes
   ps aux | grep "Google Chrome"
   ```

12. **Process Stuck**: If server becomes unresponsive, restart your AI client
   - Close AI client (Claude Desktop, etc.)
   - Reopen AI client to restart MCP server

13. **Multiple Instances**: Avoid running multiple AI clients with same MCP configuration
   - Each AI client starts its own MCP server instance
   - Multiple instances may conflict over browser resources

### Debug Information

Enable detailed logging by checking browser console outputs and MCP server logs:

- **MCP Server Logs**: Check stderr output from your AI client
- **Browser Console**: Available when using visible browser mode
- **Cookie Files**: Verify cookie files are being created/updated in specified paths
- **Process Status**: Use system monitoring tools to check server health

## Security Considerations

- Cookies are stored locally in plain text JSON format
- 24-hour automatic expiration for security
- Unique storage paths prevent cross-contamination
- No credential storage - relies on system authentication

---

## MCP Developer Integration Guide

This section is for developers who want to integrate their MCP modules with the SAP Auth MCP service.

### Architecture Overview

#### Authentication Flow

1. **MCP Module** encounters authentication requirement
2. **Returns standardized error** indicating SAP auth is needed
3. **AI Client** calls SAP Auth MCP with required parameters
4. **SAP Auth MCP** performs authentication and saves cookies to specified path
5. **MCP Module** retries operation using saved cookies

#### Cookie Storage Convention

All authenticated sessions are stored as `sap_cookies.json` files in MCP-specific directories. This standardization ensures:
- Consistent file naming across all integrations
- Easy cookie sharing between components
- Clear separation of authentication data per MCP module

### Step 1: Implement Authentication Error Response

When your MCP encounters an authentication requirement, return this standardized error format:

```json
{
  "error": "SAP_AUTH_REQUIRED",
  "details": "need call sap auth mcp to prepare cookie and redo function after",
  "data": {
    "store_path": "/path/to/your-mcp/cookies",
    "entry_url": "https://your-sap-system.sap/"
  }
}
```

**Field Descriptions:**
- `error`: Standard error code that AI clients can recognize
- `details`: Human-readable explanation for AI clients
- `store_path`: **Unique directory path** for your MCP module's cookies
- `entry_url`: The main entry point URL for your target SAP system

### Step 2: Cookie Path Conventions

- Each MCP module **must** use a unique `store_path`
- The path should be dedicated to your MCP module
- Cookie file will be named `sap_cookies.json` automatically
- Recommended pattern: `/path/to/{mcp-name}/cookies/`

**Examples:**
```
/path/to/jira-mcp/cookies/sap_cookies.json
/path/to/wiki-mcp/cookies/sap_cookies.json
/path/to/confluence-mcp/cookies/sap_cookies.json
```

### Step 3: Reading Cookies in Your MCP

After authentication, read the cookie file from your designated path:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const cookiePath = join(storePath, 'sap_cookies.json');
const cookieData = JSON.parse(readFileSync(cookiePath, 'utf8'));
```

### Step 4: Using Cookies in HTTP Requests

Convert stored cookies to appropriate format for your HTTP client:

```typescript
// Example for fetch API
const cookies = cookieData.cookies
  .map((cookie: any) => `${cookie.name}=${cookie.value}`)
  .join('; ');

const response = await fetch(url, {
  headers: {
    'Cookie': cookies,
    // ... other headers
  }
});
```

### Step 5: Handle Cookie Expiration

Monitor for authentication failures and trigger re-authentication:

```typescript
if (response.status === 401 || response.status === 403) {
  // Return SAP_AUTH_REQUIRED error to trigger re-authentication
  return {
    error: "SAP_AUTH_REQUIRED",
    details: "need call sap auth mcp to prepare cookie and redo function after",
    data: {
      store_path: "/path/to/your-mcp/cookies",
      entry_url: "https://your-sap-system.sap/"
    }
  };
}
```

### Example Integration Workflow

1. **Jira MCP** attempts to fetch issue data
2. **Receives 401 Unauthorized** from Jira API
3. **Returns standardized error:**
   ```json
   {
     "error": "SAP_AUTH_REQUIRED",
     "details": "need call sap auth mcp to prepare cookie and redo function after",
     "data": {
       "store_path": "/path/to/jira-mcp/cookies",
       "entry_url": "https://jira.tools.sap/"
     }
   }
   ```
4. **AI Client** recognizes error and calls SAP Auth MCP
5. **SAP Auth MCP** authenticates and saves cookies to `/path/to/jira-mcp/cookies/sap_cookies.json`
6. **AI Client** retries original Jira MCP operation
7. **Jira MCP** reads cookies and successfully accesses Jira API

## Contributing

When contributing to this shared authentication service, ensure:
- Backward compatibility with existing integrations
- Proper error handling and logging
- Documentation updates for new features
- Testing with multiple SAP systems

## License

MIT License - See LICENSE file for details
