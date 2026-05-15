# MCP Protocol Internals

Deep dive into how Claude Code implements the **Model Context Protocol (MCP)** — from the initial handshake through tool discovery, deferred tool loading, and resource/prompt resolution.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [MCP Handshake & Connection Lifecycle](#mcp-handshake--connection-lifecycle)
3. [Tool Discovery](#tool-discovery)
4. [Deferred Tools & On-Demand Loading](#deferred-tools--on-demand-loading)
5. [Resource & Prompt Template Resolution](#resource--prompt-template-resolution)
6. [MCP Instructions Delta](#mcp-instructions-delta)
7. [Key Source Files](#key-source-files)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code Client                       │
│                                                             │
│  ┌──────────────────────┐   ┌────────────────────────────┐  │
│  │  MCPConnectionManager │   │    useManageMCPConnections  │  │
│  │  (React Context)      │   │    (React Hook)             │  │
│  │  - reconnect          │──▶│    - init pending servers   │  │
│  │  - toggle enable      │   │    - batch connect          │  │
│  └──────────────────────┘   │    - notification handlers  │  │
│                              │    - auto-reconnect logic   │  │
│                              └──────────┬─────────────────┘  │
│                                         │                    │
│                              ┌──────────▼─────────────────┐  │
│                              │       client.ts             │  │
│                              │  - connectToServer()        │  │
│                              │  - fetchToolsForClient()    │  │
│                              │  - fetchResourcesForClient()│  │
│                              │  - fetchCommandsForClient() │  │
│                              │  - getMcpToolsAndResources() │  │
│                              └──────────┬─────────────────┘  │
│                                         │                    │
│          ┌──────────────────────────────┼─────────────┐      │
│          │              Transport Layer │             │      │
│          ▼              ▼              ▼             ▼      │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│   │  stdio   │  │   SSE    │  │   HTTP   │  │WebSocket │  │
│   │Transport │  │Transport │  │Streamable│  │Transport │  │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│        │             │             │             │          │
└────────┼─────────────┼─────────────┼─────────────┼──────────┘
         │             │             │             │
    ┌────▼────┐   ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
    │Local MCP│   │Remote   │  │Remote   │  │IDE MCP  │
    │Server   │   │MCP      │  │MCP      │  │Server   │
    │(process)│   │Server   │  │Server   │  │(VS Code)│
    └─────────┘   └─────────┘  └─────────┘  └─────────┘
```

The MCP subsystem lives primarily in `src/services/mcp/`. The key players:

| Component | File | Role |
|-----------|------|------|
| **MCPConnectionManager** | `MCPConnectionManager.tsx` | React context provider exposing `reconnect` and `toggle` |
| **useManageMCPConnections** | `useManageMCPConnections.ts` | Hook that orchestrates all connection lifecycle |
| **client.ts** | `client.ts` | Core MCP client — transport setup, handshake, tool/resource fetch |
| **config.ts** | `config.ts` | Reads MCP server configs from settings files |
| **types.ts** | `types.ts` | TypeScript types for all MCP server states |
| **ToolSearchTool** | `tools/ToolSearchTool/` | On-demand deferred tool loader |

---

## MCP Handshake & Connection Lifecycle

### Phase 1: Configuration Loading

When Claude Code starts, `useManageMCPConnections` runs two `useEffect` hooks:

1. **Initialize servers as pending** — reads all MCP configs and sets each server to `pending` state in AppState
2. **Two-phase connect** — loads Claude Code configs first (fast), then claude.ai configs (may require network)

```
Session Start
    │
    ▼
┌─────────────────────────┐
│ getClaudeCodeMcpConfigs()│  ◀── Reads from:
│                          │      - .mcp.json (project)
│                          │      - ~/.claude/settings.json (user)  
│                          │      - enterprise config
│                          │      - plugin MCP servers
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Set all servers to       │
│ 'pending' in AppState    │
└────────────┬────────────┘
             │
             ├───────────────────────────┐
             ▼                           ▼
┌─────────────────────┐     ┌─────────────────────┐
│ Phase 1: Connect     │     │ Phase 2: claude.ai   │
│ Claude Code servers  │     │ proxy configs (async) │
│ (parallel batches)   │     │ (deduplicated)        │
└─────────────────────┘     └─────────────────────┘
```

**Log trace** (from `debug.log`):
```log
[MCP] Loading MCP configs...
[MCP:my-server] Starting connection with timeout of 30000ms
[MCP:my-server] Successfully connected (transport: stdio) in 1234ms
[MCP:my-server] Connection established with capabilities: {"hasTools":true,"hasPrompts":true,"hasResources":false,"serverVersion":"1.0.0"}
```

### Phase 2: Transport Setup & MCP Initialize

`connectToServer()` (memoized by server name + config hash) creates the appropriate transport based on config type:

| Config Type | Transport Class | Notes |
|------------|----------------|-------|
| `stdio` (default) | `StdioClientTransport` | Spawns child process |
| `sse` | `SSEClientTransport` | Server-Sent Events, with OAuth |
| `http` | `StreamableHTTPClientTransport` | MCP Streamable HTTP spec |
| `ws` / `ws-ide` | `WebSocketTransport` | WebSocket with `['mcp']` protocol |
| `sse-ide` | `SSEClientTransport` | IDE extension, no auth |
| `sdk` | `SdkControlClientTransport` | In-process, for Agent SDK |
| `claudeai-proxy` | `StreamableHTTPClientTransport` | claude.ai managed connectors |

The actual MCP handshake happens inside `client.connect(transport)`:

```
Client                              Server
  │                                    │
  │──── initialize ───────────────────▶│
  │     {protocolVersion, capabilities,│
  │      clientInfo: {                 │
  │        name: "claude-code",        │
  │        version: "999.0.0-local"    │
  │      }}                            │
  │                                    │
  │◀─── initialize result ────────────│
  │     {protocolVersion,              │
  │      capabilities: {               │
  │        tools: {listChanged: true}, │
  │        prompts: {...},             │
  │        resources: {subscribe:...}, │
  │      },                            │
  │      serverInfo: {name, version},  │
  │      instructions: "..."}          │
  │                                    │
  │──── initialized ──────────────────▶│
  │     (notification, no response)    │
  │                                    │
```

**Client capabilities declared** (from `client.ts:985-1001`):
```typescript
const client = new Client(
  {
    name: 'claude-code',
    title: 'Claude Code',
    version: MACRO.VERSION ?? 'unknown',
    description: "Anthropic's agentic coding tool",
    websiteUrl: PRODUCT_URL,
  },
  {
    capabilities: {
      roots: {},        // Supports roots/list requests
      elicitation: {},  // Supports server-initiated elicitation
    },
  },
)
```

### Phase 3: Post-Connect Setup

After successful `connect()`, Claude Code:

1. **Reads server capabilities** — `client.getServerCapabilities()`, `client.getServerVersion()`, `client.getInstructions()`
2. **Registers request handlers**:
   - `ListRootsRequest` — returns the current working directory as a `file://` URI
   - `ElicitRequest` — initially returns `cancel`, overwritten by `registerElicitationHandler` once fully connected
3. **Registers notification handlers** (in `onConnectionAttempt`):
   - `ToolListChanged` → re-fetches tools via `fetchToolsForClient`
   - `PromptListChanged` → re-fetches prompts via `fetchCommandsForClient`
   - `ResourceListChanged` → re-fetches resources via `fetchResourcesForClient`
   - `ChannelMessage` (Kairos feature) → enqueues channel messages
4. **Sets up `onclose`/`onerror` handlers** for auto-reconnect with exponential backoff

### Connection States

Each MCP server connection is tracked as one of five states:

```
                    ┌──────────┐
        ┌──────────│ disabled  │◀── User toggled off
        │          └──────────┘
        │
        ▼
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ pending  │────▶│connected │────▶│  failed  │
  │          │     │          │     │          │
  └──────────┘     └──────────┘     └──────────┘
        │                │                │
        │                │                │
        │          ┌──────────┐           │
        └─────────▶│needs-auth│◀──────────┘
                   └──────────┘
```

- **pending** — config loaded, connection in progress (may show `reconnectAttempt`)
- **connected** — handshake complete, tools/resources available
- **failed** — connection or handshake error
- **needs-auth** — OAuth required (cached for 15 min to avoid re-probing)
- **disabled** — user explicitly disabled this server

### Batched Connection with Concurrency Control

Servers connect in parallel but with separate concurrency limits:

```typescript
// Local servers (stdio/sdk): lower concurrency — process spawning is expensive
await processBatched(localServers, getMcpServerConnectionBatchSize(), processServer)
//                                  ↑ default: 3 concurrent

// Remote servers: higher concurrency — just network connections
await processBatched(remoteServers, getRemoteMcpServerConnectionBatchSize(), processServer)
//                                   ↑ default: 20 concurrent
```

Env overrides: `MCP_SERVER_CONNECTION_BATCH_SIZE`, `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE`

### Auto-Reconnect with Exponential Backoff

When a remote server's transport closes unexpectedly:

```
Attempt 1: wait 1s    → reconnect
Attempt 2: wait 2s    → reconnect
Attempt 3: wait 4s    → reconnect
Attempt 4: wait 8s    → reconnect
Attempt 5: wait 16s   → reconnect (max 30s cap)
           (give up after 5 attempts)
```

Reconnect is skipped if the server was intentionally disabled.

---

## Tool Discovery

After each server connects, Claude Code immediately fetches its tools, commands (prompts), and resources in parallel:

```typescript
const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
  fetchToolsForClient(client),      // tools/list
  fetchCommandsForClient(client),   // prompts/list
  fetchMcpSkillsForClient(client),  // skill:// resources (feature-gated)
  fetchResourcesForClient(client),  // resources/list
])
```

### tools/list → Tool Objects

`fetchToolsForClient()` sends `{ method: 'tools/list' }` and maps each MCP tool to Claude Code's internal `Tool` type:

```
MCP Server Tool                    Claude Code Tool
─────────────                      ──────────────
name: "search"          ──▶       name: "mcp__myserver__search"
description: "..."      ──▶       prompt(): truncated to 2048 chars
inputSchema: {...}      ──▶       inputJSONSchema: {...}
annotations.readOnlyHint──▶       isReadOnly(), isConcurrencySafe()
annotations.destructiveHint──▶    isDestructive()
_meta.anthropic/searchHint──▶     searchHint (for ToolSearch scoring)
_meta.anthropic/alwaysLoad──▶     alwaysLoad (skip deferral)
```

Tool names are prefixed: `mcp__{normalized_server_name}__{tool_name}`.

### prompts/list → Command Objects

MCP prompts become Claude Code commands (slash commands). Each gets:
- Name: `mcp__{server}__{prompt_name}`
- A `getPromptForCommand(args)` function that calls `client.getPrompt({ name, arguments })`

### resources/list → ServerResource Objects

Resources are stored keyed by server name in `AppState.mcp.resources`. Two utility tools are auto-registered if any server supports resources:
- `ListMcpResourcesTool` — lists available resources across servers
- `ReadMcpResourceTool` — reads a specific resource by server name + URI

### Notification-Driven Refresh

MCP servers can notify the client when their tool/prompt/resource lists change:

```
Server ──notifications/tools/list_changed──▶ Client
         │
         ▼
   fetchToolsForClient.cache.delete(serverName)
   newTools = await fetchToolsForClient(client)
   updateServer({ ...client, tools: newTools })
```

The same pattern applies for `prompts/list_changed` and `resources/list_changed`.

---

## Deferred Tools & On-Demand Loading

This is one of Claude Code's most sophisticated MCP features. Instead of sending all MCP tool schemas to the LLM upfront (which would consume massive context), tools are **deferred** and loaded on-demand via `ToolSearchTool`.

### What Gets Deferred?

From `src/tools/ToolSearchTool/prompt.ts`:

```typescript
function isDeferredTool(tool: Tool): boolean {
  // Explicit opt-out — _meta['anthropic/alwaysLoad'] = true
  if (tool.alwaysLoad === true) return false

  // All MCP tools are deferred by default
  if (tool.isMcp === true) return true

  // ToolSearch itself is never deferred (the model needs it to load others)
  if (tool.name === TOOL_SEARCH_TOOL_NAME) return false

  // Built-in tools with shouldDefer: true
  return tool.shouldDefer === true
}
```

### How the LLM Sees Deferred Tools

When tool search is enabled, deferred tools are sent to the API with `defer_loading: true` in their definition. The LLM sees only their names (no schema, no description) in a system message:

```xml
<available-deferred-tools>
mcp__plugin_aisuite_aisuite__python
mcp__plugin_browser_browser__browser_click
mcp__plugin_browser_browser__browser_navigate
...
</available-deferred-tools>
```

Or, when delta mode is enabled (`isDeferredToolsDeltaEnabled()`), new tools are announced incrementally via `deferred_tools_delta` attachments — only showing what changed since the last announcement.

### ToolSearchTool: The On-Demand Loader

When the LLM needs a deferred tool, it calls `ToolSearchTool`:

```
LLM: "I need to use the browser navigation tool"
  │
  ▼
ToolSearchTool.call({ query: "select:mcp__plugin_browser_browser__browser_navigate" })
  │
  ▼
Returns tool_reference blocks:
  { type: "tool_reference", tool_name: "mcp__plugin_browser_browser__browser_navigate" }
  │
  ▼
API expands tool_reference → full tool schema injected into context
  │
  ▼
LLM can now call mcp__plugin_browser_browser__browser_navigate with correct parameters
```

### Three Query Modes

1. **Direct select** — `select:ToolName` or `select:Tool1,Tool2,Tool3`
   - Exact name match, returns immediately
   - Most common: model knows which tool it wants

2. **Keyword search** — `"notebook jupyter"` or `"browser navigate"`
   - Searches tool names (parsed into parts) and descriptions
   - Scoring: exact part match (10-12pts) > partial match (5-6pts) > description match (2pts)
   - MCP tools get bonus points for server name matches

3. **Required + optional** — `"+slack send message"`
   - `+slack` is required (must appear in name or description)
   - `send message` are optional ranking terms

### Token Threshold Auto-Enable

When `ENABLE_TOOL_SEARCH=auto` (or `auto:N`), tool search is only enabled when deferred tool definitions exceed N% of the context window (default 10%):

```
Total deferred tool tokens > (context_window × 10%)  →  enable ToolSearch
                                                     →  otherwise load all inline
```

This is checked per-request via `isToolSearchEnabled()`, using either exact token counting (via API) or a character-based heuristic fallback.

### Cross-Compaction Persistence

When conversation context is compacted (messages removed to save tokens), discovered tool references must survive. Two mechanisms:

1. **Compact boundary** — `compactMetadata.preCompactDiscoveredTools` snapshots discovered tool names onto the boundary marker
2. **Snip protection** — messages containing `tool_reference` blocks are protected from removal

`extractDiscoveredToolNames()` scans message history to rebuild the full set of previously-discovered tools.

---

## Resource & Prompt Template Resolution

### Resources

MCP resources are URI-addressable data that servers expose. Claude Code handles them through two tools:

**ListMcpResourcesTool** — Lists all available resources across connected servers:
```typescript
// Returns resources from AppState.mcp.resources
// Keyed by server name: { "server1": [resource1, resource2], "server2": [...] }
```

**ReadMcpResourceTool** — Reads a specific resource:
```typescript
// Input: { server: "my-server", uri: "file:///path/to/resource" }
//
// Calls: client.request({ method: 'resources/read', params: { uri } })
//
// Returns: { contents: [{ uri, mimeType, text }] }
// Binary blobs are persisted to disk and replaced with file paths
```

Both tools have `shouldDefer: true` — they're loaded on-demand via ToolSearch just like MCP tools.

### Prompt Templates (Commands)

MCP prompts become slash commands in Claude Code. Resolution flow:

```
User types: /mcp__myserver__analyze code
                │
                ▼
  Command lookup by name: "mcp__myserver__analyze"
                │
                ▼
  getPromptForCommand("code")
                │
                ▼
  ensureConnectedClient(client)  // Reconnect if needed
                │
                ▼
  client.getPrompt({
    name: "analyze",
    arguments: { arg1: "code" }  // zipObject(argNames, argsArray)
  })
                │
                ▼
  Server returns: { messages: [{ role: "user", content: {...} }] }
                │
                ▼
  transformResultContent() → ContentBlockParam[]
  (text → text blocks, images → base64 blocks, resource links → read & inline)
```

### Resource Links in Tool Results

When MCP tool results contain `resource_link` content blocks, Claude Code resolves them:

```typescript
// In transformResultContent():
case 'resource':
  // ResourceLink: { type: "resource_link", resource: { uri, mimeType, text? } }
  // If text is provided inline → use directly
  // If only URI → read from server via resources/read
  // Binary content → persist to disk, return file path
```

---

## MCP Instructions Delta

MCP servers can provide instructions (guidance text) during the `initialize` handshake. These are injected into the system prompt so the LLM knows how to interact with each server.

### Traditional Mode

Instructions are rebuilt into the system prompt every turn via `DANGEROUS_uncachedSystemPromptSection` — any late-connecting server causes a cache-bust.

### Delta Mode (newer)

When `isMcpInstructionsDeltaEnabled()` is true, instructions are announced incrementally:

```typescript
getMcpInstructionsDelta(mcpClients, messages, clientSideInstructions)
// Returns: {
//   addedNames: ["server1"],
//   addedBlocks: ["## server1\nUse this server for..."],
//   removedNames: ["old-server"]
// }
```

Delta attachments (`mcp_instructions_delta`) are persisted in message history, allowing the LLM to see which servers connected/disconnected during the conversation.

**Client-side instructions** can supplement server-authored ones — e.g., the claude-in-chrome MCP server gets client-side context the server itself doesn't know about.

---

## Key Source Files

| File | Purpose |
|------|---------|
| `src/services/mcp/client.ts` | Core: transport setup, handshake, tool/resource/command fetch, tool execution |
| `src/services/mcp/useManageMCPConnections.ts` | React hook: connection lifecycle, notification handlers, auto-reconnect |
| `src/services/mcp/MCPConnectionManager.tsx` | React context provider |
| `src/services/mcp/types.ts` | Type definitions for all MCP configs and connection states |
| `src/services/mcp/config.ts` | Config loading from settings files |
| `src/services/mcp/auth.ts` | OAuth provider for MCP servers |
| `src/services/mcp/claudeai.ts` | claude.ai proxy connector configs |
| `src/tools/ToolSearchTool/ToolSearchTool.ts` | On-demand deferred tool loader |
| `src/tools/ToolSearchTool/prompt.ts` | `isDeferredTool()`, `formatDeferredToolLine()` |
| `src/utils/toolSearch.ts` | Tool search mode detection, token threshold, `extractDiscoveredToolNames` |
| `src/utils/mcpInstructionsDelta.ts` | MCP instructions delta tracking |
| `src/tools/ReadMcpResourceTool/ReadMcpResourceTool.ts` | Read MCP resources |
| `src/tools/ListMcpResourcesTool/ListMcpResourcesTool.ts` | List MCP resources |
| `src/tools/MCPTool/MCPTool.ts` | Base MCPTool definition |
| `src/utils/mcpWebSocketTransport.ts` | WebSocket transport implementation |
| `src/services/mcp/InProcessTransport.ts` | In-process transport (chrome, computer use) |

---

## Debug Logging

All MCP operations are logged via `logMCPDebug()` and `logMCPError()` to `~/.claude/logs/debug.log`:

```bash
# Watch MCP activity in real-time
tail -f ~/.claude/logs/debug.log | grep "\[MCP"
```

Key log patterns to watch for:
```
[MCP:server-name] Starting connection with timeout of 30000ms
[MCP:server-name] Successfully connected (transport: stdio) in 1234ms
[MCP:server-name] Connection established with capabilities: {...}
[MCP:server-name] Received tools/list_changed notification, refreshing tools
[MCP:server-name] SSE transport closed/disconnected, attempting automatic reconnection
[MCP:server-name] Scheduling reconnection attempt 2 in 2000ms
```
