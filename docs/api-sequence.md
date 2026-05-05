# API Communication Sequence Diagram

## Complete Request-Response Flow with Actual Events

```mermaid
sequenceDiagram
    participant Client as Claude Code Client
    participant Gateway as API Gateway<br/>(Salesforce/Anthropic)
    participant LLM as Claude LLM

    Note over Client: User enters: "Say hello"
    
    Client->>Gateway: HTTP POST /v1/messages
    Note right of Client: Headers:<br/>x-api-key: sk-xxx...<br/>anthropic-version: 2023-06-01<br/>content-type: application/json
    Note right of Client: Body:<br/>{model, messages, tools,<br/>system, stream: true}
    
    Gateway->>LLM: Forward request
    Note right of Gateway: May add AWS auth<br/>if using Bedrock
    
    LLM-->>Gateway: HTTP 200 OK
    Note left of LLM: Content-Type: text/event-stream<br/>Transfer-Encoding: chunked
    
    Gateway-->>Client: Start SSE Stream
    
    Note over Client,LLM: ═══ Streaming Events ═══
    
    LLM-->>Client: event: message_start
    Note left of LLM: {type: "message_start",<br/>id: "msg_bdrk_019...",<br/>usage: {input_tokens: 10}}
    Note right of Client: [1964ms] TTFT<br/>(Time To First Token)
    
    LLM-->>Client: event: content_block_start
    Note left of LLM: {index: 0, type: "thinking"}
    Note right of Client: [1965ms] Thinking begins
    
    LLM-->>Client: event: content_block_delta
    Note left of LLM: {delta: {thinking: "The user..."}}
    
    LLM-->>Client: event: content_block_delta
    Note left of LLM: {delta: {thinking: "is asking..."}}
    
    LLM-->>Client: event: content_block_stop
    Note left of LLM: {index: 0}
    Note right of Client: [4579ms] Thinking complete
    
    LLM-->>Client: event: content_block_start
    Note left of LLM: {index: 1, type: "text"}
    Note right of Client: [4581ms] Response begins
    
    LLM-->>Client: event: content_block_delta
    Note left of LLM: {delta: {text: "Hello! "}}
    Note right of Client: Display: "Hello! "
    
    LLM-->>Client: event: content_block_delta
    Note left of LLM: {delta: {text: "I'm Claude"}}
    Note right of Client: Display: "I'm Claude"
    
    LLM-->>Client: event: content_block_delta
    Note left of LLM: {delta: {text: ", ready..."}}
    Note right of Client: Display: ", ready..."
    
    LLM-->>Client: event: content_block_stop
    Note left of LLM: {index: 1}
    Note right of Client: [6047ms] Text complete
    
    LLM-->>Client: event: message_delta
    Note left of LLM: {stop_reason: "end_turn",<br/>usage: {output_tokens: 200}}
    Note right of Client: [6150ms] Metadata
    
    LLM-->>Client: event: message_stop
    Note left of LLM: {type: "message_stop"}
    Note right of Client: [6152ms] Stream ends
    
    Note over Client,LLM: ═══ Total Time: 6.2 seconds ═══
```

---

## Timing Breakdown

| Event | Time (ms) | Duration | Description |
|-------|-----------|----------|-------------|
| Request sent | 0 | - | HTTP POST initiated |
| message_start | 1964 | 1964ms | **TTFT** - First token |
| Thinking block | 1965-4579 | 2614ms | Internal reasoning |
| Text streaming | 4581-6047 | 1466ms | User-visible output |
| message_delta | 6150 | - | Final metadata |
| message_stop | 6152 | - | Complete |
| **Total** | **6152** | **6.2s** | End-to-end |

---

## Event Flow with Examples

### 1. Request
```http
POST /v1/messages HTTP/1.1
Host: your-bedrock-gateway.example.com
Content-Type: application/json
x-api-key: sk-ant-xxxxxxxxxxxxxxxxxxxxx

{
  "model": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "messages": [{"role": "user", "content": "Say hello"}],
  "stream": true
}
```

### 2. Response Stream (SSE Format)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream

event: message_start
data: {"type":"message_start","message":{"id":"msg_bdrk_019ZFX2PgKaxYhWV7YNBnAA7"...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"The user..."}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"is asking..."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hello! "}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"I'm Claude"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":200}}

event: message_stop
data: {"type":"message_stop"}
```

---

## Cache Optimization Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant LLM as Claude LLM
    participant Cache as Prompt Cache

    Note over C: First request with same system prompt
    
    C->>LLM: Request (cache_control: ephemeral)
    LLM->>Cache: Store system prompt
    Note right of Cache: 8722 tokens cached<br/>Cost: $0.032
    LLM-->>C: Response
    Note left of LLM: cache_creation_input_tokens: 8722
    
    Note over C: Second request (within 5 minutes)
    
    C->>LLM: Request (same system prompt)
    LLM->>Cache: Read from cache
    Note right of Cache: 8474 tokens from cache<br/>Cost: $0.0025 (90% savings!)
    LLM-->>C: Response
    Note left of LLM: cache_read_input_tokens: 8474<br/>Much faster!
```

**Cache hit saves:**
- 💰 **Cost:** 90% reduction ($0.032 → $0.0025)
- ⚡ **Speed:** Faster processing (no need to re-process system prompt)

---

## Error Handling

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant LLM as LLM

    C->>G: POST /v1/messages
    
    alt 401 Authentication Error
        G-->>C: 401 Unauthorized
        Note right of C: Log: Authentication Error,<br/>No api key passed in
    else 429 Rate Limit
        G-->>C: 429 Too Many Requests
        Note right of C: Retry with exponential backoff
    else 500 Server Error
        LLM-->>G: 500 Internal Server Error
        G-->>C: 500 (retry)
        Note right of C: Attempt fallback model
    else Connection Timeout
        G-xC: Timeout after 600s
        Note right of C: Log: Connection error<br/>Retry attempt
    else Success
        G-->>C: 200 OK + Stream
    end
```

---

## Multi-Turn Conversation with Tools

```mermaid
sequenceDiagram
    participant C as Client
    participant LLM as LLM
    participant Tools as Local Tools

    Note over C: User: "Read config.json"
    
    C->>LLM: Turn 1: Request with tools
    Note right of C: tools: [Read, Edit, Bash, ...]
    
    LLM-->>C: Response: tool_use
    Note left of LLM: stop_reason: "tool_use"<br/>content: [{type: "tool_use",<br/>name: "Read"...}]
    
    C->>Tools: Execute Read(config.json)
    Tools-->>C: File contents
    
    C->>LLM: Turn 2: Request with tool_result
    Note right of C: messages: [user, assistant,<br/>tool_result]
    
    LLM-->>C: Response: Final answer
    Note left of LLM: stop_reason: "end_turn"<br/>content: "Here's the content..."
```

---

## Key Takeaways

1. ✅ **REST API, not WebSocket** - Each query is independent HTTP POST
2. ✅ **Server-Sent Events (SSE)** - One-way streaming from server
3. ✅ **Multiple content blocks** - Thinking + text in same response
4. ✅ **Incremental streaming** - Text appears word-by-word
5. ✅ **Prompt caching** - 90% cost reduction on repeated prompts
6. ✅ **Tool calling** - Multi-turn conversation for complex tasks
7. ✅ **Token counting** - Detailed usage in every response

The design prioritizes simplicity and reliability over bidirectional communication.
