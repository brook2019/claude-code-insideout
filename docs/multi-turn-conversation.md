# Multi-Turn Conversation with Tool Use

## Complete Example: Message Flow Between Client and Claude

This document shows the **complete message format** for a multi-turn conversation, including:
- Initial user request
- Claude's tool use response
- Tool execution result
- Final response

---

## Example Task: "Read config.json and summarize it"

### Turn 1: Initial Request

**Client → Claude:**

```json
POST /v1/messages
{
  "model": "claude-sonnet-4.5",
  "max_tokens": 4096,
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code, a helpful coding assistant."
    }
  ],
  "tools": [
    {
      "name": "Read",
      "description": "Reads a file from the filesystem",
      "input_schema": {
        "type": "object",
        "properties": {
          "file_path": {"type": "string"}
        },
        "required": ["file_path"]
      }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Read config.json and summarize it"
    }
  ]
}
```

**Claude → Client (Streaming Response):**

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_01ABC","role":"assistant"...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"The user wants me to read a file..."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01XYZ","name":"Read"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"file"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"_path\":\"/path/to/config.json\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":150}}

event: message_stop
data: {"type":"message_stop"}
```

**Assembled Response:**

```json
{
  "id": "msg_01ABC",
  "role": "assistant",
  "content": [
    {
      "type": "thinking",
      "thinking": "The user wants me to read a file called config.json..."
    },
    {
      "type": "tool_use",
      "id": "toolu_01XYZ",
      "name": "Read",
      "input": {
        "file_path": "/path/to/config.json"
      }
    }
  ],
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 500,
    "output_tokens": 150
  }
}
```

---

### Turn 2: Tool Result + Continuation

**Client executes Read tool locally, then sends:**

```json
POST /v1/messages
{
  "model": "claude-sonnet-4.5",
  "max_tokens": 4096,
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code, a helpful coding assistant."
    }
  ],
  "tools": [
    {
      "name": "Read",
      "description": "Reads a file from the filesystem",
      "input_schema": {...}
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "Read config.json and summarize it"
    },
    {
      "role": "assistant",
      "content": [
        {
          "type": "thinking",
          "thinking": "The user wants me to read a file called config.json..."
        },
        {
          "type": "tool_use",
          "id": "toolu_01XYZ",
          "name": "Read",
          "input": {
            "file_path": "/path/to/config.json"
          }
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "tool_result",
          "tool_use_id": "toolu_01XYZ",
          "content": "{\n  \"database\": {\n    \"host\": \"localhost\",\n    \"port\": 5432\n  },\n  \"logging\": {\n    \"level\": \"debug\"\n  }\n}"
        }
      ]
    }
  ]
}
```

**Claude → Client (Streaming Response):**

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_02DEF","role":"assistant"...}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"I've received the file contents. It's a JSON config with database and logging settings..."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"The config.json file contains:\n\n"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"**Database Configuration:**\n"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"- Host: localhost\n- Port: 5432\n\n"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"**Logging:**\n- Level: debug"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":80}}

event: message_stop
data: {"type":"message_stop"}
```

**Assembled Response:**

```json
{
  "id": "msg_02DEF",
  "role": "assistant",
  "content": [
    {
      "type": "thinking",
      "thinking": "I've received the file contents. It's a JSON config with database and logging settings..."
    },
    {
      "type": "text",
      "text": "The config.json file contains:\n\n**Database Configuration:**\n- Host: localhost\n- Port: 5432\n\n**Logging:**\n- Level: debug"
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 650,
    "output_tokens": 80
  }
}
```

---

## Message Array Evolution

### Turn 1 - Messages sent to Claude:
```json
[
  {"role": "user", "content": "Read config.json and summarize it"}
]
```

### Turn 2 - Messages sent to Claude:
```json
[
  {"role": "user", "content": "Read config.json and summarize it"},
  {"role": "assistant", "content": [{"type": "tool_use", ...}]},
  {"role": "user", "content": [{"type": "tool_result", ...}]}
]
```

### Turn 3 - If user replies again:
```json
[
  {"role": "user", "content": "Read config.json and summarize it"},
  {"role": "assistant", "content": [{"type": "tool_use", ...}]},
  {"role": "user", "content": [{"type": "tool_result", ...}]},
  {"role": "assistant", "content": [{"type": "text", "text": "The config.json file contains..."}]},
  {"role": "user", "content": "What's the database port?"}
]
```

---

## Key Observations

### 1. Message Array Growth
Each turn adds new messages to the array:
- **Turn 1:** 1 message (user request)
- **Turn 2:** 3 messages (user → assistant → user with tool_result)
- **Turn 3:** 5 messages (continues growing)

### 2. Role Alternation Pattern
```
user → assistant → user → assistant → user → assistant
```
The pattern must always alternate. Tool results are sent as "user" role.

### 3. Assistant Messages Preserved
When continuing a conversation:
- ✅ Include Claude's previous responses in full
- ✅ Include thinking blocks
- ✅ Include tool_use blocks
- This provides context for the next response

### 4. Tool Results as User Messages
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01XYZ",
      "content": "..."
    }
  ]
}
```

### 5. Each Turn is a New HTTP POST
- Not a persistent connection
- Each request is independent
- Previous context must be sent every time

### 6. Content Types
Assistant can return multiple content blocks in one response:
- `thinking` - Internal reasoning (optional)
- `text` - User-visible text
- `tool_use` - Request to execute a tool

User messages can contain:
- `text` - Plain text input
- `image` - Image data (base64 or URL)
- `tool_result` - Result from tool execution

---

## Complete Token Count

| Turn | Input Tokens | Output Tokens | Cumulative Input |
|------|-------------|---------------|------------------|
| Turn 1 | 500 | 150 | 500 |
| Turn 2 | 650 | 80 | 1,150 |
| Turn 3 | 730 | 60 | 1,880 |

**Why input tokens grow:**
- Each turn includes all previous messages
- Turn 1: Only the initial user message + system prompt + tools
- Turn 2: User message + assistant response + tool result + system + tools
- Turn 3: All of the above + another assistant response + new user message

**Cost implications:**
- Input tokens: $0.003 per 1K tokens
- Output tokens: $0.015 per 1K tokens
- Longer conversations get more expensive per turn
- Prompt caching can reduce costs by 90% for repeated system prompts

---

## Multi-Tool Example

Claude can use multiple tools in one response:

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "thinking",
      "thinking": "I need to read two files and compare them..."
    },
    {
      "type": "tool_use",
      "id": "toolu_01AAA",
      "name": "Read",
      "input": {"file_path": "file1.txt"}
    },
    {
      "type": "tool_use",
      "id": "toolu_02BBB",
      "name": "Read",
      "input": {"file_path": "file2.txt"}
    }
  ],
  "stop_reason": "tool_use"
}
```

The client must execute **both tools** and return both results:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01AAA",
      "content": "Contents of file1.txt..."
    },
    {
      "type": "tool_result",
      "tool_use_id": "toolu_02BBB",
      "content": "Contents of file2.txt..."
    }
  ]
}
```

---

## Error Handling

### Tool Execution Failure

If a tool fails, send an error in the tool_result:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01XYZ",
      "is_error": true,
      "content": "Error: File not found: /path/to/config.json"
    }
  ]
}
```

Claude will see the error and can respond appropriately:

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I couldn't find the config.json file. Could you check if the file exists or provide the correct path?"
    }
  ]
}
```

---

## Summary

**The Message Flow:**
1. 📤 Client sends user request with available tools
2. 🤔 Claude thinks and decides to use a tool
3. 📤 Client receives tool_use response
4. ⚙️ Client executes tool locally
5. 📤 Client sends tool_result back to Claude
6. 💬 Claude provides final answer
7. 🔄 Process repeats for each new user message

**Key takeaways:**
- Each API call is stateless - you must send full conversation history
- Messages array grows with each turn
- Tool execution happens on the client side
- Thinking blocks provide insight into Claude's reasoning
- Token usage increases with conversation length
