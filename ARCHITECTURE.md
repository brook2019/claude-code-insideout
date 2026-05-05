# Claude Code Architecture

This document provides a deep dive into Claude Code's internal architecture, focusing on how it authenticates with various API providers and processes user queries.

## Table of Contents

- [Overview](#overview)
- [Authentication System](#authentication-system)
- [Request Lifecycle](#request-lifecycle)
- [Tool System](#tool-system)
- [State Management](#state-management)
- [Key Components](#key-components)

---

## Overview

Claude Code is a terminal-based AI assistant that uses React (via Ink) for the UI and communicates with Large Language Models through the Anthropic SDK. The architecture is built around a query-response loop with support for tool execution.

### High-Level Architecture

```
┌─────────────┐
│    User     │
└──────┬──────┘
       │ Input
       ↓
┌─────────────────────────────────┐
│   Terminal UI (React + Ink)    │
│   - TextInput Component         │
│   - REPL Screen                 │
│   - Message Display             │
└───────────┬─────────────────────┘
            │
            ↓
┌─────────────────────────────────┐
│   Application Layer             │
│   - ProcessUserInput            │
│   - HandlePromptSubmit          │
│   - Command System              │
└───────────┬─────────────────────┘
            │
            ↓
┌─────────────────────────────────┐
│   Query Engine                  │
│   - Message Normalization       │
│   - Tool Execution Loop         │
│   - Response Streaming          │
└───────────┬─────────────────────┘
            │
            ↓
┌─────────────────────────────────┐
│   API Layer                     │
│   - Authentication              │
│   - Client Management           │
│   - Request Formatting          │
└───────────┬─────────────────────┘
            │
            ↓
┌─────────────────────────────────┐
│   External LLM API              │
│   - Anthropic API               │
│   - AWS Bedrock                 │
│   - GCP Vertex AI               │
│   - Azure Foundry               │
└─────────────────────────────────┘
```

---

## Authentication System

Claude Code supports multiple authentication methods for different API providers. The authentication flow is centralized in `src/services/api/client.ts`.

**📊 [View Authentication Flow Diagrams](docs/authentication-flow.md)** - Interactive Mermaid diagrams showing all 6 authentication methods with detailed sequence flows.

### Authentication Decision Tree

```
┌─────────────────────────────────┐
│  Start Authentication           │
└────────────┬────────────────────┘
             │
             ↓
      Is Claude.ai Subscriber?
             │
         ┌───┴───┐
         │  YES  │
         └───┬───┘
             │
   ┌─────────↓─────────┐
   │  OAuth Token Auth  │
   │  - Access token    │
   │  - Auto-refresh    │
   └────────────────────┘
         
         ┌───┴───┐
         │   NO  │
         └───┬───┘
             │
             ↓
    Using 3rd Party Platform?
             │
    ┌────────┼────────┐
    │        │        │
  Bedrock  Vertex  Foundry
    │        │        │
    ↓        ↓        ↓
[AWS Auth][GCP Auth][Azure Auth]
    
         ┌───┴───┐
         │   NO  │
         └───┬───┘
             │
             ↓
    Has ANTHROPIC_AUTH_TOKEN?
             │
         ┌───┴───┐
         │  YES  │
         └───┬───┘
             │
   ┌─────────↓─────────┐
   │  Bearer Token Auth │
   │  Authorization:    │
   │  Bearer <token>    │
   └────────────────────┘
         
         ┌───┴───┐
         │   NO  │
         └───┬───┘
             │
             ↓
    Has ANTHROPIC_API_KEY?
             │
         ┌───┴───┐
         │  YES  │
         └───┬───┘
             │
   ┌─────────↓─────────┐
   │   API Key Auth     │
   │   x-api-key:       │
   │   <api-key>        │
   └────────────────────┘
         
         ┌───┴───┐
         │   NO  │
         └───┬───┘
             │
             ↓
    Has API Key Helper?
             │
         ┌───┴───┐
         │  YES  │
         └───┬───┘
             │
   ┌─────────↓─────────┐
   │  Helper Key Auth   │
   │  From settings     │
   └────────────────────┘
         
         ┌───┴───┐
         │   NO  │
         └───┬───┘
             │
             ↓
    ┌─────────────────┐
    │ Authentication  │
    │     Failed      │
    └─────────────────┘
```

### Authentication Methods

#### 1. OAuth Authentication (Claude.ai Subscribers)

**Environment Variables:** None (uses stored tokens)

**Flow:**
```typescript
// Check if user is a Claude.ai subscriber
if (isClaudeAISubscriber()) {
  // Use OAuth access token
  authToken: getClaudeAIOAuthTokens()?.accessToken
}

// Before each request
await checkAndRefreshOAuthTokenIfNeeded()
```

**Log Output:**
```
[AUTH] OAuth token check starting
[AUTH] OAuth token check complete
```

**Use Case:** Paid claude.ai users who want to use their subscription

#### 2. Direct API Key (x-api-key header)

**Environment Variable:** `ANTHROPIC_API_KEY`

**Flow:**
```typescript
// src/services/api/client.ts:327
apiKey: process.env.ANTHROPIC_API_KEY || getAnthropicApiKey()
```

**HTTP Header:**
```
x-api-key: sk-ant-xxxxxxxxxxxxx
```

**Log Output:**
```
[CLIENT] Creating client with API key
```

**Use Case:** Standard Anthropic API access

#### 3. Bearer Token (Authorization header)

**Environment Variable:** `ANTHROPIC_AUTH_TOKEN`

**Flow:**
```typescript
// src/services/api/client.ts:343-353
async function configureApiKeyHeaders(headers, isNonInteractiveSession) {
  const token = process.env.ANTHROPIC_AUTH_TOKEN ||
                (await getApiKeyFromApiKeyHelper(isNonInteractiveSession))
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
}
```

**HTTP Header:**
```
Authorization: Bearer sk-ant-xxxxxxxxxxxxx
```

**Log Output:**
```
[AUTH] Using ANTHROPIC_AUTH_TOKEN
[CLIENT] Authorization header configured
```

**Use Case:** Custom gateways, proxies, or alternative auth schemes

#### 4. AWS Bedrock Authentication

**Environment Variables:**
- `CLAUDE_CODE_USE_BEDROCK=1`
- `AWS_BEARER_TOKEN_BEDROCK` (Option A)
- AWS credentials via aws-sdk (Option B)
- `ANTHROPIC_AUTH_TOKEN` (Fallback)

**Flow:**
```typescript
// src/services/api/client.ts:156-215
if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) {
  // Option A: Bearer token for Bedrock API key auth
  if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
    bedrockArgs.skipAuth = true
    bedrockArgs.defaultHeaders = {
      Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`
    }
  }
  // Option B: AWS IAM credentials
  else {
    const credentials = await refreshAndGetAwsCredentials()
    bedrockArgs.awsAccessKey = credentials.accessKeyId
    bedrockArgs.awsSecretKey = credentials.secretAccessKey
    bedrockArgs.awsSessionToken = credentials.sessionToken
  }
}
```

**Log Output:**
```
[CLIENT] Entering BEDROCK path
[AUTH] Using AWS_BEARER_TOKEN_BEDROCK
  OR
[AUTH] Using AWS credentials refresh
[CLIENT] Creating AnthropicBedrock client
```

**Use Case:** AWS Bedrock users with IAM roles or API keys

#### 5. GCP Vertex AI Authentication

**Environment Variables:**
- `CLAUDE_CODE_USE_VERTEX=1`
- `ANTHROPIC_VERTEX_PROJECT_ID`
- `CLOUD_ML_REGION` (optional)
- GCP credentials via google-auth-library

**Flow:**
```typescript
// src/services/api/client.ts:246-322
if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) {
  const googleAuth = new GoogleAuth({
    projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  })
  
  return new AnthropicVertex({
    region: getVertexRegionForModel(model),
    googleAuth
  })
}
```

**Log Output:**
```
[CLIENT] Entering VERTEX path
[CLIENT] Creating AnthropicVertex client
```

**Use Case:** GCP Vertex AI users with service accounts

#### 6. Azure Foundry Authentication

**Environment Variables:**
- `CLAUDE_CODE_USE_FOUNDRY=1`
- `ANTHROPIC_FOUNDRY_RESOURCE` or `ANTHROPIC_FOUNDRY_BASE_URL`
- `ANTHROPIC_FOUNDRY_API_KEY` (Option A)
- Azure AD via DefaultAzureCredential (Option B)

**Flow:**
```typescript
// src/services/api/client.ts:216-244
if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
  let azureADTokenProvider
  if (!process.env.ANTHROPIC_FOUNDRY_API_KEY) {
    // Use Azure AD authentication
    const { DefaultAzureCredential, getBearerTokenProvider } = 
      await import('@azure/identity')
    azureADTokenProvider = getBearerTokenProvider(
      new DefaultAzureCredential(),
      'https://cognitiveservices.azure.com/.default'
    )
  }
  
  return new AnthropicFoundry({
    azureADTokenProvider
  })
}
```

**Log Output:**
```
[CLIENT] Entering FOUNDRY path
[CLIENT] Creating AnthropicFoundry client
```

**Use Case:** Azure Foundry users with API keys or Azure AD

### Authentication Priority

The authentication system follows this priority order:

1. **OAuth Token** (if Claude.ai subscriber)
2. **Platform-specific auth** (if using Bedrock/Vertex/Foundry)
3. **Bearer Token** (if `ANTHROPIC_AUTH_TOKEN` set)
4. **API Key** (if `ANTHROPIC_API_KEY` set)
5. **API Key Helper** (from settings file)
6. **Fail** (no authentication available)

### Request Headers

Every API request includes these headers:

```typescript
const defaultHeaders = {
  'x-app': 'cli',                          // Client type
  'User-Agent': getUserAgent(),            // Version info
  'X-Claude-Code-Session-Id': getSessionId(), // Session tracking
  'x-claude-remote-container-id': containerId, // Container sessions
  'x-client-app': clientApp,               // SDK consumer ID
  ...customHeaders                         // Custom headers from env
}
```

**Custom Headers:**
```bash
# Add custom headers via environment variable
export ANTHROPIC_CUSTOM_HEADERS="X-Custom-Header: value
X-Another-Header: another-value"
```

### Credential Refresh

OAuth and cloud provider credentials are automatically refreshed:

```typescript
// OAuth refresh (before each request)
await checkAndRefreshOAuthTokenIfNeeded()

// AWS credentials refresh
const credentials = await refreshAndGetAwsCredentials()

// GCP credentials refresh  
await refreshGcpCredentialsIfNeeded()
```

---

## Request Lifecycle

### Complete Flow

1. **User Input** → TextInput captures keystrokes
2. **Input Processing** → Parse commands, validate, create messages
3. **Prompt Submission** → Handle special cases, enqueue commands
4. **REPL Orchestration** → Acquire query guard, manage state
5. **Query Engine** → Main request/response loop
6. **API Call** → Format request, authenticate, call LLM
7. **Response Streaming** → Process events, yield chunks
8. **Tool Execution** → Execute tools, add results, loop back
9. **Completion** → Update state, display results

### Query Loop

```typescript
async function* query(params) {
  let turnCount = 0
  
  while (true) {
    turnCount++
    
    // Prepare request
    const messagesForQuery = normalizeMessagesForAPI(messages)
    
    // Call LLM
    const response = await queryModelWithVCR(
      messagesForQuery,
      tools,
      model
    )
    
    // Stream response
    for await (const event of response) {
      yield event
      
      if (event.type === 'message') {
        const stopReason = event.message.stop_reason
        
        if (stopReason === 'tool_use') {
          // Execute tools
          const toolResults = await executeTools(event.message.content)
          messages.push(...toolResults)
          // Continue loop (next turn)
          continue
        }
        
        if (stopReason === 'end_turn') {
          // Done
          return
        }
      }
    }
  }
}
```

### Tool Execution Cycle

When the LLM needs to use tools:

```
Turn 1: User asks "read config.json"
  ↓
  LLM responds: tool_use (Read tool)
  ↓
  Execute: Read(file_path="config.json")
  ↓
  Add tool result to messages

Turn 2: Send updated messages with tool result
  ↓
  LLM responds: "Here's the content..."
  ↓
  stop_reason: end_turn
  ↓
  Complete
```

**Log Output:**
```
[QUERY] Starting API call iteration - turnCount: 1
[LLM] queryModelWithVCR called - tools.length: 22
[QUERY] stop_reason: tool_use
[QUERY] Tool use blocks found: Read
[QUERY] Executing tools...
[QUERY] Starting API call iteration - turnCount: 2
[QUERY] stop_reason: end_turn
[QUERY] Query completed
```

---

## Tool System

Claude Code provides 22 tools to the LLM:

### Available Tools

| Tool | Purpose | Permissions Required |
|------|---------|---------------------|
| **Read** | Read file contents | File access |
| **Write** | Create/overwrite files | File write |
| **Edit** | Modify existing files | File write |
| **Bash** | Execute shell commands | Command execution |
| **Agent** | Spawn sub-agents | None |
| **WebFetch** | Fetch web content | Network access |
| **WebSearch** | Search the web | Network access |
| **TaskCreate** | Create tasks | None |
| **TaskUpdate** | Update task status | None |
| **TaskList** | List tasks | None |
| ... | (and 11 more) | ... |

### Tool Invocation Flow

```
1. LLM decides to use a tool
   ↓
2. Returns tool_use content block:
   {
     "type": "tool_use",
     "id": "toolu_123",
     "name": "Read",
     "input": {"file_path": "/path/to/file"}
   }
   ↓
3. Query engine extracts tool use blocks
   ↓
4. Execute tool (may prompt user for permission)
   ↓
5. Create tool_result block:
   {
     "type": "tool_result",
     "tool_use_id": "toolu_123",
     "content": "File contents here..."
   }
   ↓
6. Add to messages, continue query loop
```

### Permission System

Tools require user approval based on settings:

```typescript
// Check if tool can be used
const canUse = await canUseTool(toolName, toolInput)

if (!canUse) {
  // Prompt user for approval
  // Or auto-deny based on settings
}
```

**Permission Sources:**
1. `.claude/settings.json` - Project-level
2. `~/.claude/settings.json` - Global user settings
3. Runtime prompts - Ask user

---

## State Management

### Application State

```typescript
interface AppState {
  // Query state
  isQuerying: boolean
  queryGeneration: number
  
  // Messages
  messages: Message[]
  systemPrompt: string[]
  
  // UI state
  textInput: string
  cursorPosition: number
  selectedMessageId: string | null
  
  // Session state
  sessionId: string
  sessionTitle: string
  workingDirectory: string
  
  // Configuration
  model: string
  allowedTools: string[]
  apiProvider: 'anthropic' | 'bedrock' | 'vertex' | 'foundry'
}
```

### Query Guard

Prevents concurrent queries:

```typescript
// Acquire guard
const currentGeneration = ++queryGeneration
queryGuard = new QueryGuard(currentGeneration)

// Only proceed if still current
if (queryGeneration !== currentGeneration) {
  return // Canceled
}
```

**Log Output:**
```
[REPL] Query guard acquired, generation: 1
[REPL] Starting query
[REPL] Query completed for generation: 1
```

---

## Key Components

### 1. Entry Point (`src/entrypoints/cli.tsx`)

- Parses command-line arguments
- Initializes environment
- Starts TUI or headless mode

### 2. REPL Screen (`src/screens/REPL.tsx`)

- Main UI component (React + Ink)
- Manages query state
- Handles user interactions
- Displays messages

### 3. Query Engine (`src/query.ts`)

- Core query loop
- Message normalization
- Tool execution coordination
- Streaming response handling

### 4. API Client (`src/services/api/client.ts`)

- Creates Anthropic client instances
- Manages authentication
- Handles platform-specific clients

### 5. LLM Service (`src/services/api/claude.ts`)

- Formats API requests
- Manages streaming responses
- Processes events (message_start, content_block, etc.)

### 6. Tool System (`src/tools/`)

- Tool implementations
- Permission checks
- Result formatting

### 7. Authentication (`src/utils/auth.ts`)

- Token management
- OAuth refresh
- Credential retrieval

---

## Configuration Files

### `.env` - Environment Variables

```bash
# Authentication
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_AUTH_TOKEN=sk-ant-xxx

# API Configuration
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4.5

# Logging
CLAUDE_CODE_DEBUG_ENABLED=1
CLAUDE_CODE_DEBUG_LOG=~/.claude/logs/debug.log

# Platform Selection
CLAUDE_CODE_USE_BEDROCK=0
CLAUDE_CODE_USE_VERTEX=0
CLAUDE_CODE_USE_FOUNDRY=0
```

### `.claude/settings.json` - Project Settings

```json
{
  "permissions": {
    "allow": [
      "Bash(npm *)",
      "Read(**/*.ts)"
    ],
    "deny": [
      "Bash(rm -rf *)"
    ]
  },
  "model": "claude-sonnet-4.5",
  "mcpServers": {}
}
```

---

## Logging Components

All components write structured logs:

| Component | Prefix | Location |
|-----------|--------|----------|
| Input Handler | `INPUT` | `src/hooks/useTextInput.ts` |
| Process Input | `PROCESS_INPUT` | `src/utils/processUserInput/` |
| Prompt Submit | `PROMPT` | `src/utils/handlePromptSubmit.ts` |
| REPL | `REPL` | `src/screens/REPL.tsx` |
| Query | `QUERY` | `src/query.ts` |
| LLM | `LLM` | `src/services/api/claude.ts` |
| Client | `CLIENT` | `src/services/api/client.ts` |
| Auth | `AUTH` | `src/services/api/client.ts` |
| Fetch | `FETCH` | `src/services/api/client.ts` |

---

## Further Reading

- [Request Flow Sequence Diagram](docs/sequence-diagram.md)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [AWS Bedrock Claude Models](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [GCP Vertex AI](https://cloud.google.com/vertex-ai/docs)
- [Azure Foundry](https://azure.microsoft.com/en-us/products/ai-services/)
