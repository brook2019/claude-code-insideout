# Claude Code Client ↔ LLM API Communication

## Protocol: REST API with Server-Sent Events (SSE)

**Answer:** Claude Code uses **REST API with streaming via Server-Sent Events (SSE)**, NOT WebSocket.

- **Method:** HTTP POST
- **Streaming:** Server-Sent Events (SSE) over HTTP/1.1
- **Endpoint:** `/v1/messages` (or Bedrock equivalent)

---

## Communication Flow

```mermaid
sequenceDiagram
    participant Client as Claude Client
    participant Gateway as API Gateway<br/>(Salesforce proxy or Anthropic direct)
    participant LLM as Claude LLM

    Client->>Gateway: HTTP POST /v1/messages<br/>Content-Type: application/json<br/>Stream: true
    Gateway->>LLM: Forwards request
    LLM-->>Client: HTTP 200 OK<br/>Content-Type: text/event-stream<br/>Transfer-Encoding: chunked

    Note over LLM,Client: SSE Events Stream
    LLM-->>Client: message_start
    LLM-->>Client: content_block_start
    LLM-->>Client: content_block_delta (multiple)
    LLM-->>Client: content_block_stop
    LLM-->>Client: message_delta
    LLM-->>Client: message_stop
```

---

## 1. Request (Client → Server)

### HTTP Method
```
POST /v1/messages HTTP/1.1
```

### Request Headers

```json
{
  "accept": "application/json",
  "anthropic-beta": "claude-code-20250219",
  "anthropic-dangerous-direct-browser-access": "true",
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
  "user-agent": "claude-cli/999.0.0-local (undefined, cli)",
  "x-api-key": "sk-ant-xxxxxxxxxxxxxxxxxxxxx",
  "x-app": "cli",
  "x-claude-code-session-id": "6d481646-4e04-4af3-a0d9-28c8fd4822d3",
  "x-stainless-arch": "arm64",
  "x-stainless-lang": "js",
  "x-stainless-os": "MacOS",
  "x-stainless-package-version": "0.80.0",
  "x-stainless-retry-count": "0",
  "x-stainless-runtime": "node",
  "x-stainless-runtime-version": "v24.3.0",
  "x-stainless-timeout": "600"
}
```

### Request Body

```json
{
  "model": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "messages": [
    {
      "role": "user",
      "content": "<available-deferred-tools>...</available-deferred-tools>"
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "<system-reminder>...</system-reminder>"
        },
        {
          "type": "text",
          "text": "Say hello",
          "cache_control": {"type": "ephemeral"}
        }
      ]
    }
  ],
  "system": [
    {
      "type": "text",
      "text": "x-anthropic-billing-header: cc_version=999.0.0-local.844; cc_entrypoint=cli;"
    },
    {
      "type": "text",
      "text": "You are Claude Code, Anthropic's official CLI for Claude.",
      "cache_control": {"type": "ephemeral"}
    },
    {
      "type": "text",
      "text": "... (long system prompt with instructions) ...",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "tools": [
    {
      "name": "Read",
      "description": "Reads a file from the local filesystem...",
      "input_schema": {
        "type": "object",
        "properties": {
          "file_path": {"type": "string"},
          "offset": {"type": "integer"},
          "limit": {"type": "integer"}
        },
        "required": ["file_path"]
      }
    },
    // ... 18 more tools (Edit, Bash, Agent, etc.)
  ],
  "betas": ["claude-code-20250219"],
  "metadata": {
    "user_id": "{\"device_id\":\"...\",\"session_id\":\"...\"}"
  },
  "max_tokens": 32000,
  "thinking": {
    "budget_tokens": 31999,
    "type": "enabled"
  },
  "stream": true
}
```

---

## 2. Response (Server → Client)

### Response Headers

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Transfer-Encoding: chunked
Connection: keep-alive
Cache-Control: no-cache
```

### Response Body (Server-Sent Events)

The response comes as a **stream of events**, not a single JSON response:

#### Event 1: `message_start`
```json
event: message_start
data: {
  "type": "message_start",
  "message": {
    "id": "msg_bdrk_019ZFX2PgKaxYhWV7YNBnAA7",
    "type": "message",
    "role": "assistant",
    "model": "claude-sonnet-4-5-20250929",
    "content": [],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": {
      "input_tokens": 10,
      "cache_creation_input_tokens": 8722,
      "cache_read_input_tokens": 8474,
      "output_tokens": 0
    }
  }
}
```

**Log entry:**
```
[2026-05-04T04:10:14.031Z] [TRACE] [LLM] message_start received - id: msg_bdrk_019ZFX2PgKaxYhWV7YNBnAA7, model: claude-sonnet-4-5-20250929, role: assistant, ttftMs: 1964
[2026-05-04T04:10:14.031Z] [TRACE] [LLM] message_start usage - input_tokens: 10, cache_creation_input_tokens: 8722, cache_read_input_tokens: 8474
```

---

#### Event 2: `content_block_start` (thinking)
```json
event: content_block_start
data: {
  "type": "content_block_start",
  "index": 0,
  "content_block": {
    "type": "thinking",
    "thinking": ""
  }
}
```

**Log entry:**
```
[2026-05-04T04:10:14.032Z] [TRACE] [LLM] content_block_start - index: 0, type: thinking
```

---

#### Event 3-N: `content_block_delta` (streaming chunks)
```json
event: content_block_delta
data: {
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "thinking_delta",
    "thinking": "The user is asking me to say hello..."
  }
}
```

---

#### Event: `content_block_stop` (thinking done)
```json
event: content_block_stop
data: {
  "type": "content_block_stop",
  "index": 0
}
```

**Log entry:**
```
[2026-05-04T04:10:16.646Z] [TRACE] [LLM] content_block_stop - index: 0, type: thinking
```

---

#### Event: `content_block_start` (text response)
```json
event: content_block_start
data: {
  "type": "content_block_start",
  "index": 1,
  "content_block": {
    "type": "text",
    "text": ""
  }
}
```

**Log entry:**
```
[2026-05-04T04:10:16.648Z] [TRACE] [LLM] content_block_start - index: 1, type: text
```

---

#### Event: Multiple `content_block_delta` (text chunks)
```json
event: content_block_delta
data: {
  "type": "content_block_delta",
  "index": 1,
  "delta": {
    "type": "text_delta",
    "text": "Hello! I'm Claude, "
  }
}

event: content_block_delta
data: {
  "type": "content_block_delta",
  "index": 1,
  "delta": {
    "type": "text_delta",
    "text": "ready to help you"
  }
}
```

---

#### Event: `content_block_stop` (text done)
```json
event: content_block_stop
data: {
  "type": "content_block_stop",
  "index": 1
}
```

**Log entry:**
```
[2026-05-04T04:10:18.114Z] [TRACE] [LLM] content_block_stop - index: 1, type: text
```

---

#### Event: `message_delta` (metadata update)
```json
event: message_delta
data: {
  "type": "message_delta",
  "delta": {
    "stop_reason": "end_turn",
    "stop_sequence": null
  },
  "usage": {
    "output_tokens": 200
  }
}
```

**Log entry:**
```
[2026-05-04T04:10:18.217Z] [TRACE] [LLM] message_delta received - stop_reason: end_turn
[2026-05-04T04:10:18.217Z] [TRACE] [LLM] message_delta usage - output_tokens: 200
```

---

#### Event: `message_stop` (stream complete)
```json
event: message_stop
data: {
  "type": "message_stop"
}
```

**Log entry:**
```
[2026-05-04T04:10:18.219Z] [TRACE] [LLM] message_stop - stop_reason: end_turn, usage: input=10, output=200
```

---

## Event Timeline Example

```
Time (ms)  Event                    Description
──────────────────────────────────────────────────────────────
0          HTTP POST                Client sends request
1964       message_start            Server starts processing (TTFT)
1965       content_block_start      Thinking block begins
4579       content_block_stop       Thinking done (2.6s)
4581       content_block_start      Text response begins
6047       content_block_stop       Text complete (1.5s)
6150       message_delta            Final token count
6152       message_stop             Stream ends
──────────────────────────────────────────────────────────────
Total: ~6.2 seconds
```

---

## Token Usage Breakdown

From the logs:

```json
{
  "input_tokens": 10,
  "cache_creation_input_tokens": 8722,    // New prompt cache created
  "cache_read_input_tokens": 8474,        // Read from cache (75% hit rate!)
  "output_tokens": 200,
  "cache_creation": {
    "ephemeral_5m_input_tokens": 8722,
    "ephemeral_1h_input_tokens": 0
  }
}
```

**Cost calculation:**
- Input: 10 tokens × $0.003/1K = $0.00003
- Cache creation: 8722 tokens × $0.00375/1K = $0.03271
- Cache read: 8474 tokens × $0.0003/1K = $0.00254
- Output: 200 tokens × $0.015/1K = $0.003
- **Total: ~$0.038**

---

## Why SSE instead of WebSocket?

1. **Simpler implementation** - HTTP POST with streaming response
2. **Better for request-response pattern** - Each query is independent
3. **Easier retry logic** - Failed requests can be retried with same POST
4. **Better caching** - HTTP headers support CDN/proxy caching
5. **Firewall friendly** - Port 443 HTTPS, not WebSocket upgrade
6. **Standard REST semantics** - Works with existing HTTP infrastructure

---

## Comparison: SSE vs WebSocket

| Feature | SSE (Used by Claude) | WebSocket |
|---------|---------------------|-----------|
| Connection | HTTP → Streaming | HTTP → Upgrade |
| Direction | Server → Client only | Bidirectional |
| Protocol | HTTP/1.1 or HTTP/2 | WS or WSS |
| Reconnect | Automatic | Manual |
| Caching | HTTP cache works | No caching |
| Firewall | Standard HTTPS | May be blocked |
| Use case | Streaming responses | Real-time chat |

---

## Code Implementation

### Client Side (Anthropic SDK)

```typescript
// From src/services/api/claude.ts
const stream = await anthropic.messages.create({
  model: 'claude-sonnet-4.5',
  messages: [...],
  stream: true  // ← Enables SSE streaming
})

// Process events
for await (const event of stream) {
  switch (event.type) {
    case 'message_start':
      // Handle start
      break
    case 'content_block_delta':
      // Stream text chunks
      process.stdout.write(event.delta.text)
      break
    case 'message_stop':
      // Complete
      break
  }
}
```

### Under the Hood

The SDK uses `fetch()` with streaming:

```typescript
// Simplified version
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  },
  body: JSON.stringify(requestBody)
})

// Response is a ReadableStream
const reader = response.body.getReader()
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  // Parse SSE format: "data: {...}\n\n"
  const events = parseSSE(value)
  for (const event of events) {
    yield event
  }
}
```

---

## Summary

✅ **Protocol:** REST API (HTTP POST)  
✅ **Streaming:** Server-Sent Events (SSE)  
✅ **Endpoint:** `/v1/messages`  
✅ **Format:** JSON request → SSE stream response  
✅ **Events:** message_start → content_block_delta (chunks) → message_stop  
✅ **No WebSocket:** Uses standard HTTP streaming  

This approach is simpler, more reliable, and works better with existing web infrastructure than WebSocket.
