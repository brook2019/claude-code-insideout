# Request Lifecycle Sequence Diagram

This diagram shows the complete flow of a user query through Claude Code's internal systems.

## Complete Request Flow

```mermaid
sequenceDiagram
    participant User
    participant Input as TextInput Handler
    participant Process as ProcessUserInput
    participant Submit as HandlePromptSubmit
    participant REPL as REPL Screen
    participant Query as Query Engine
    participant LLM as LLM Service
    participant Client as API Client
    participant Auth as Auth Service
    participant API as Anthropic API

    User->>Input: Type prompt and press Enter
    Note over Input: Captures user input
    Input->>Input: Log: Input received
    
    Input->>Process: processUserInput(inputString, mode)
    Note over Process: Parse and validate input
    Process->>Process: Log: mode=prompt, skipSlashCommands=false
    Process->>Process: Check for slash commands
    Process->>Process: Create user message
    
    Process-->>Submit: Result: shouldQuery=true, messages, model
    Submit->>Submit: Log: shouldQuery result
    
    Submit->>REPL: onQuery(shouldQuery, messages, model)
    Note over REPL: Main query orchestration
    REPL->>REPL: Log: onQuery called
    REPL->>REPL: Acquire query guard (generation++)
    REPL->>REPL: Log: Query guard acquired
    
    REPL->>Query: query(messages, model, systemPrompt)
    Note over Query: Core query logic
    Query->>Query: Log: query() called with params
    Query->>Query: Normalize messages for API
    Query->>Query: Enter API call loop
    
    loop API Call with Retry
        Query->>LLM: queryModelWithVCR(messages, tools, model)
        Note over LLM: Prepare API request
        LLM->>LLM: Log: queryModelWithVCR called
        LLM->>LLM: Build request params
        LLM->>LLM: Add system prompts
        LLM->>LLM: Add tools (22 tools)
        LLM->>LLM: Log: API Request details
        
        LLM->>Client: getAnthropicClient(model)
        Note over Client: Initialize API client
        Client->>Client: Log: getAnthropicClient called
        
        Client->>Auth: checkAndRefreshOAuthTokenIfNeeded()
        Auth->>Auth: Log: OAuth token check
        Auth-->>Client: Token status
        
        Client->>Auth: configureApiKeyHeaders()
        Note over Auth: Get API key or bearer token
        Auth->>Auth: Check ANTHROPIC_AUTH_TOKEN
        Auth->>Auth: Or get from API key helper
        Auth->>Auth: Log: Using auth method
        Auth-->>Client: Headers with auth
        
        Client->>Client: Build default headers
        Client->>Client: Add User-Agent, session ID
        Client->>Client: Log: Client configuration
        Client-->>LLM: Anthropic client instance
        
        LLM->>API: client.messages.stream(params)
        Note over API: Stream API call
        LLM->>LLM: Log: Outgoing request headers
        
        API-->>LLM: Stream events
        Note over LLM: Process streaming response
        
        loop Stream Processing
            LLM->>LLM: Receive stream event
            LLM->>LLM: Log: Event type
            alt message_start
                LLM->>LLM: Log: Usage (input tokens, cache)
            else content_block_delta
                LLM->>LLM: Yield text/tool_use chunks
            else message_delta
                LLM->>LLM: Log: Output tokens
            else message_stop
                LLM->>LLM: Log: Stop reason, total usage
            end
        end
        
        LLM-->>Query: Yielded message events
        Query->>Query: Log: Received message from API
        Query->>Query: Check stop_reason
        
        alt stop_reason == tool_use
            Query->>Query: Extract tool use blocks
            Query->>Query: Log: Tool use blocks found
            Query->>Query: Execute tools
            Query->>Query: Add tool results to messages
            Query->>Query: Continue loop (next turn)
        else stop_reason == end_turn
            Query->>Query: Exit loop
        else error
            Query->>Query: Log: Error details
            Query->>Query: Retry or fail
        end
    end
    
    Query-->>REPL: Final response
    REPL->>REPL: Log: Query completed
    REPL->>REPL: Update UI state
    REPL-->>User: Display response

    Note over User,API: Complete request lifecycle logged at each step
```

**📊 [View Authentication Flow Diagrams](authentication-flow.md)** - Detailed sequence diagrams for all 6 authentication methods (OAuth, API Key, Bearer Token, AWS Bedrock, GCP Vertex AI, Azure Foundry).

---

## Key Components Explained

### 1. **Input Layer**
- `TextInput Handler`: Captures raw user input
- Logs the input string for debugging

### 2. **Processing Layer**
- `ProcessUserInput`: Parses commands, validates input
- Creates structured messages for the API
- Logs: input mode, command detection, message creation

### 3. **Query Orchestration (REPL)**
- `REPL Screen`: Main coordinator
- Manages query state (guard, generation)
- Logs: query start, state changes, completion

### 4. **Query Engine**
- `Query`: Core request/response loop
- Handles tool execution cycle
- Logs: API call attempts, messages received, stop reasons

### 5. **LLM Service**
- `LLM Service`: Prepares API requests
- Formats parameters, adds tools
- Logs: request details, response events, streaming

### 6. **API Client**
- `API Client`: Manages HTTP client
- Handles authentication
- Logs: client creation, auth method, headers

### 7. **Authentication**
- `Auth Service`: Token management
- OAuth refresh, API key retrieval
- Logs: auth method used, token status

### 8. **External API**
- `Anthropic API`: External LLM service
- Streams responses back
- Logged via request/response capture

## Log Components and Their Roles

| Component | Log Prefix | Purpose |
|-----------|------------|---------|
| Input Handler | `INPUT` | User input capture |
| ProcessUserInput | `PROCESS_INPUT` | Input parsing and validation |
| HandlePromptSubmit | `PROMPT` | Prompt submission handling |
| REPL Screen | `REPL` | Query orchestration |
| Query Engine | `QUERY` | Request/response loop |
| LLM Service | `LLM` | API request preparation |
| API Client | `CLIENT` | HTTP client management |
| Auth Service | `AUTH` | Authentication |
| Fetch Layer | `FETCH` | HTTP request/response |

## Example Log Flow

For a simple query like "explain this code", you'll see logs in this order:

```
[INPUT] Input received: explain this code
[PROCESS_INPUT] processUserInput called - mode: prompt
[PROCESS_INPUT] Created user message
[PROMPT] handlePromptSubmit called
[PROMPT] shouldQuery=true, messages.length=1
[REPL] onQuery called - shouldQuery: true
[REPL] Query guard acquired, generation: 1
[QUERY] query() called - messages.length: 1
[QUERY] Entering API call loop
[QUERY] Starting API call iteration - turnCount: 1
[LLM] queryModelWithVCR called - tools.length: 22
[CLIENT] getAnthropicClient called
[AUTH] OAuth token check starting
[AUTH] Using ANTHROPIC_AUTH_TOKEN
[CLIENT] Creating client with auth headers
[LLM] API Request - model: claude-sonnet-4.5, max_tokens: 32000
[LLM] Streaming started
[LLM] message_start - input_tokens: 1500
[LLM] content_block_delta - text chunk received
[LLM] message_delta - output_tokens: 250
[LLM] message_stop - stop_reason: end_turn
[QUERY] Query completed successfully
[REPL] Updating UI with response
```

## Viewing the Flow in Your Logs

To see this flow in action:

```bash
# Run a query
echo "explain how authentication works" | ./bin/claude-code-insideout -p

# View the logs
tail -f ~/.claude/logs/debug.log

# Or filter by component
grep "\[QUERY\]" ~/.claude/logs/debug.log
grep "\[AUTH\]" ~/.claude/logs/debug.log
```

## Understanding Tool Use Cycles

When Claude needs to use tools, the flow loops:

```
1. Initial query → Claude responds with tool_use
2. Log: "stop_reason: tool_use"
3. Execute tools (Read, Edit, Bash, etc.)
4. Add tool results to messages
5. Send messages back to API (turnCount: 2)
6. Claude processes results → responds
7. Repeat until stop_reason: end_turn
```

Each iteration is logged, showing:
- Turn count
- Tools being called
- Tool execution results
- Next request preparation
