# Development Guide

This guide covers the architecture and patterns used across all MCP servers in this monorepo.

## Architecture Overview

### Shared Packages

| Package | Purpose |
|---------|---------|
| `sap-auth` | Authentication (SSO, OAuth, API tokens) |
| `mcp-utils` | MCP utilities (responses, errors, tool wrappers) |
| `mcp-logger` | Consistent file-based logging |

### Server Structure

All servers follow this consistent structure:

```
src/
├── index.ts          # Entry point (thin, ~20-50 lines)
├── server.ts         # Server class with setup
├── types.ts          # Type definitions
├── handlers/         # Tool handlers by domain
│   ├── index.ts      # registerAllHandlers()
│   └── *-handlers.ts
├── api/              # External API clients
│   └── *.ts
└── services/         # Internal services
    └── *.ts
```

## Patterns

### 1. Server Class Pattern

All servers use a class with a `run()` method:

```typescript
export class MyServer {
  private server: McpServer;

  constructor(config: Config) {
    this.server = new McpServer({ name: "my-server", version: "1.0.0" });
    this.setupTools();
  }

  private setupTools(): void {
    const context: HandlerContext = { server: this.server, /* ... */ };
    registerAllHandlers(context);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Server running on stdio");
  }
}
```

### 2. Handler Registration Pattern

Handlers are organized by domain and registered via `registerAllHandlers()`:

```typescript
// handlers/index.ts
export function registerAllHandlers(context: HandlerContext): void {
  registerSearchHandlers(context);
  registerContentHandlers(context);
}

// handlers/search-handlers.ts
export function registerSearchHandlers(context: HandlerContext): void {
  const { server, apiClient } = context;

  server.registerTool("search", schema,
    wrapToolHandler(
      (args) => handleSearch(apiClient, args),
      errorOptions
    )
  );
}
```

### 3. Tool Handler Wrapper

Use `wrapToolHandler()` from mcp-utils for consistent error handling:

```typescript
import { wrapToolHandler } from 'mcp-utils';
import { isAuthError, formatAuthError } from 'sap-auth';

const errorOptions = {
  isAuthError,
  onAuthError: (error: unknown) => formatAuthError(error),
};

server.registerTool("my_tool", schema,
  wrapToolHandler(
    (args) => handleMyTool(args),
    errorOptions
  )
);
```

### 4. Response Helpers

Use response helpers from mcp-utils:

```typescript
import { jsonResponse, textResponse, textError } from 'mcp-utils';

// Success with JSON
return jsonResponse({ items, count: items.length });

// Success with text
return textResponse(`Created item ${id}`);

// Error
return textError(`Failed to create: ${message}`);
```

### 5. API Client Pattern

API clients are in `api/` directory:

```typescript
// api/my-client.ts
export class MyApiClient {
  constructor(
    private authManager: AuthManager,
    private baseUrl: string
  ) {}

  async getItem(id: string): Promise<Item> {
    const creds = await this.authManager.getCredentials('provider');
    const response = await fetch(`${this.baseUrl}/items/${id}`, {
      headers: credentialsToHeaders(creds)
    });
    return response.json();
  }
}
```

### 6. Logging

Use the shared logger:

```typescript
import { createLogger } from 'mcp-logger';

const log = createLogger('my-server');
log.info('Starting server');
log.debug('Debug details');  // Only shown when VERBOSE=true
log.error('Something failed', error);
```

### 7. Constants

Define constants at the top of files:

```typescript
// ============================================================================
// Constants
// ============================================================================
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 5000;
```

### 8. Delays

Use the `delay()` helper instead of raw setTimeout:

```typescript
import { delay } from 'mcp-utils';

await delay(RETRY_DELAY_MS);  // Clean and readable
```

## Best Practices

1. **Keep index.ts thin** - Just import and start server (~20-50 lines)
2. **Use registerTool pattern** - Not setRequestHandler with switch
3. **Wrap handlers** - Use wrapToolHandler() for consistent error handling
4. **Extract constants** - No magic numbers in code
5. **Type properly** - Avoid `any`, use `unknown` with type guards
6. **Use shared utilities** - Don't duplicate code across servers
7. **Log to stderr** - Use console.error() for MCP compatibility

## Adding a New Server

1. Create directory: `packages/servers/my-mcp/`
2. Copy structure from existing server (sap-wiki-mcp is simplest)
3. Add to root `package.json` workspaces
4. Add to root `package.json` build:servers script
5. Implement handlers in `handlers/` directory
6. Use shared packages (sap-auth, mcp-utils, mcp-logger)

## Build Commands

```bash
npm run build           # Build all packages
npm run build:shared    # Build only shared packages
npm run build:servers   # Build only servers
```
