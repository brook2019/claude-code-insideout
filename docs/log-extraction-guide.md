# Log Extraction Guide

This guide shows you how to extract LLM request/response data from `debug.log`.

## Quick Start

Use the provided script:

```bash
# Show summary
./scripts/extract-llm-data.sh

# Show full request JSON
./scripts/extract-llm-data.sh ~/.claude/logs/debug.log request

# Show only token usage
./scripts/extract-llm-data.sh ~/.claude/logs/debug.log tokens
```

## What's in the Logs?

### 1. Request to LLM (`[LLM] Send request to LLM:`)

This log entry contains **everything** sent to the LLM:

```json
{
  "model": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "messages": [
    {
      "role": "user",
      "content": "Your prompt here"
    }
  ],
  "system": [
    {
      "type": "text",
      "text": "You are Claude Code..."
    }
  ],
  "tools": [
    {
      "name": "Read",
      "description": "...",
      "input_schema": {...}
    }
  ],
  "metadata": {
    "user_id": "{...}"
  },
  "max_tokens": 32000,
  "thinking": {
    "budget_tokens": 31999,
    "type": "enabled"
  }
}
```

**Contains:**
- Model name
- User messages (your prompts)
- System prompt (instructions to Claude)
- Available tools (Read, Write, Bash, etc.)
- Tool schemas
- Context control (cache_control)
- Metadata (session ID, device ID)
- Token limits

### 2. Response from LLM

#### Response Metadata
```
[LLM] message_start received - id: msg_xxx, model: claude-sonnet-4-5, role: assistant, ttftMs: 1964
[LLM] message_start usage - input_tokens: 10, cache_creation_input_tokens: 8722, cache_read_input_tokens: 8474
```

**Contains:**
- Message ID
- Model used
- Time to first token (TTFT)
- Token usage:
  - `input_tokens`: New tokens processed
  - `cache_creation_input_tokens`: Tokens cached for future use
  - `cache_read_input_tokens`: Tokens read from cache (cheaper!)

#### Response Text Content
```
[LLM] Received text delta: "Hello! I can help you..."
```

These deltas are streamed chunks of the response text.

#### Thinking Blocks (Extended Thinking)
```
[LLM] thinking block started - index: 0
[LLM] thinking block completed - length: 568
```

Shows when Claude uses extended thinking before responding.

### 3. Request Headers
```
[FETCH] Outgoing request headers: {
  "x-api-key": "sk-xxx",
  "anthropic-version": "2023-06-01",
  "x-claude-code-session-id": "..."
}
```

Shows authentication and session information.

---

## Manual Extraction (grep/jq)

### Extract Full Request JSON
```bash
grep "\[LLM\] Send request to LLM:" ~/.claude/logs/debug.log | \
  tail -1 | \
  sed 's/.*Send request to LLM: //' | \
  jq '.'
```

### Extract System Prompt
```bash
grep "\[LLM\] Send request to LLM:" ~/.claude/logs/debug.log | \
  tail -1 | \
  sed 's/.*Send request to LLM: //' | \
  jq -r '.system[]?.text'
```

### Extract User Messages
```bash
grep "\[LLM\] Send request to LLM:" ~/.claude/logs/debug.log | \
  tail -1 | \
  sed 's/.*Send request to LLM: //' | \
  jq -r '.messages[] | select(.role == "user") | .content'
```

### Extract Model Name
```bash
grep "\[LLM\] Send request to LLM:" ~/.claude/logs/debug.log | \
  tail -1 | \
  sed 's/.*Send request to LLM: //' | \
  jq -r '.model'
```

### Extract Available Tools
```bash
grep "\[LLM\] Send request to LLM:" ~/.claude/logs/debug.log | \
  tail -1 | \
  sed 's/.*Send request to LLM: //' | \
  jq -r '.tools[]?.name'
```

### Extract Token Usage
```bash
grep "message_start usage" ~/.claude/logs/debug.log | tail -1
```

### Extract Response Text
```bash
grep "\[LLM\] Received text delta:" ~/.claude/logs/debug.log | \
  sed 's/.*Received text delta: //' | \
  tr -d '\n'
```

### Extract API Keys (Be Careful!)
```bash
grep "x-api-key" ~/.claude/logs/debug.log | tail -1
```

---

## Analyzing Specific Queries

### Find a Specific Query by Timestamp
```bash
# Get logs from a specific time
grep "2026-05-04T04:10" ~/.claude/logs/debug.log
```

### Track a Single Request Through the Pipeline
```bash
# Find by request ID
REQUEST_ID="msg_bdrk_019ZFX2PgKaxYhWV7YNBnAA7"
grep "$REQUEST_ID" ~/.claude/logs/debug.log
```

### Compare Multiple Requests
```bash
# Extract all requests today
grep "$(date +%Y-%m-%d)" ~/.claude/logs/debug.log | \
  grep "\[LLM\] Send request to LLM:"
```

---

## Common Use Cases

### 1. Debug Why a Query Failed
```bash
# Find errors around a specific time
grep -A 10 -B 10 "ERROR" ~/.claude/logs/debug.log
```

### 2. Understand Tool Execution
```bash
# See which tools were executed
grep "\[TOOL\]" ~/.claude/logs/debug.log
```

### 3. Analyze Token Usage Over Time
```bash
# Get all token usage entries
grep "message_start usage" ~/.claude/logs/debug.log | \
  awk -F'input_tokens: ' '{print $2}' | \
  awk '{print $1}' | \
  sed 's/,//'
```

### 4. Extract Complete Request/Response Pair
```bash
# Get the last complete interaction
echo "=== REQUEST ==="
grep "\[LLM\] Send request to LLM:" ~/.claude/logs/debug.log | \
  tail -1 | \
  sed 's/.*Send request to LLM: //' | \
  jq '.'

echo -e "\n=== RESPONSE ==="
grep "\[LLM\] Received text delta:" ~/.claude/logs/debug.log | \
  tail -20 | \
  sed 's/.*Received text delta: //'
```

### 5. Track Caching Efficiency
```bash
# Compare cache hits vs misses
grep "cache_read_input_tokens" ~/.claude/logs/debug.log | \
  tail -10
```

---

## Log Entry Format

### General Structure
```
[TIMESTAMP] [LEVEL] [COMPONENT] Message
```

Example:
```
[2026-05-04T04:10:12.067Z] [TRACE] [LLM] [LLM] Send request to LLM: {...}
```

### Key Components
- `[QUERY]` - Query processing
- `[LLM]` - LLM API interactions
- `[TOOL]` - Tool execution
- `[FETCH]` - Network requests
- `[REPL]` - REPL/UI interactions

---

## Advanced: Parse Logs Programmatically

### Python Example
```python
import json
import re
from datetime import datetime

def extract_requests(log_file):
    """Extract all LLM requests from log file"""
    with open(log_file, 'r') as f:
        for line in f:
            if '[LLM] Send request to LLM:' in line:
                # Extract JSON
                json_str = line.split('Send request to LLM: ', 1)[1]
                try:
                    data = json.loads(json_str)
                    yield {
                        'timestamp': line[:24],
                        'model': data.get('model'),
                        'messages': data.get('messages'),
                        'tools_count': len(data.get('tools', [])),
                    }
                except json.JSONDecodeError:
                    continue

# Usage
for req in extract_requests('~/.claude/logs/debug.log'):
    print(f"{req['timestamp']}: Model={req['model']}, Tools={req['tools_count']}")
```

### JavaScript/TypeScript Example
```typescript
import fs from 'fs';

interface LLMRequest {
  timestamp: string;
  model: string;
  messages: any[];
  tools: any[];
}

function extractRequests(logFile: string): LLMRequest[] {
  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n');
  const requests: LLMRequest[] = [];

  for (const line of lines) {
    if (line.includes('[LLM] Send request to LLM:')) {
      const jsonStr = line.split('Send request to LLM: ')[1];
      try {
        const data = JSON.parse(jsonStr);
        requests.push({
          timestamp: line.substring(0, 24),
          model: data.model,
          messages: data.messages,
          tools: data.tools,
        });
      } catch (e) {
        continue;
      }
    }
  }

  return requests;
}
```

---

## Tips & Tricks

### 1. Filter by Date
```bash
# Today's logs only
grep "$(date +%Y-%m-%d)" ~/.claude/logs/debug.log

# Specific hour
grep "2026-05-04T14:" ~/.claude/logs/debug.log
```

### 2. Tail Logs in Real-Time
```bash
# Watch logs as they come in
tail -f ~/.claude/logs/debug.log

# With filtering
tail -f ~/.claude/logs/debug.log | grep "\[LLM\]"
```

### 3. Count Queries
```bash
# How many queries today?
grep "$(date +%Y-%m-%d)" ~/.claude/logs/debug.log | \
  grep -c "\[LLM\] Send request to LLM:"
```

### 4. Find Most Used Tools
```bash
grep "\[LLM\] Send request to LLM:" ~/.claude/logs/debug.log | \
  sed 's/.*Send request to LLM: //' | \
  jq -r '.tools[]?.name' | \
  sort | uniq -c | sort -rn
```

### 5. Calculate Total Tokens Used
```bash
# Sum all input tokens
grep "message_start usage" ~/.claude/logs/debug.log | \
  grep -oP 'input_tokens: \K\d+' | \
  awk '{sum+=$1} END {print sum}'
```

---

## Sanitizing Logs for Sharing

Before sharing logs publicly:

```bash
# Remove API keys
sed 's/sk-[a-zA-Z0-9_-]*/sk-REDACTED/g' debug.log > sanitized.log

# Remove session IDs
sed 's/"session_id":"[^"]*"/"session_id":"REDACTED"/g' sanitized.log > final.log

# Remove device IDs
sed 's/"device_id":"[^"]*"/"device_id":"REDACTED"/g' final.log > shared.log
```

---

## Related Commands

### View Log File
```bash
# Full log
cat ~/.claude/logs/debug.log

# Last 100 lines
tail -100 ~/.claude/logs/debug.log

# First 100 lines
head -100 ~/.claude/logs/debug.log

# With line numbers
cat -n ~/.claude/logs/debug.log
```

### Search Logs
```bash
# Find specific text
grep "error" ~/.claude/logs/debug.log -i

# Count occurrences
grep -c "Send request" ~/.claude/logs/debug.log

# Show context (5 lines before/after)
grep -C 5 "Send request" ~/.claude/logs/debug.log
```

---

## Troubleshooting

### Log file is too large
```bash
# Rotate logs
mv ~/.claude/logs/debug.log ~/.claude/logs/debug.log.old
touch ~/.claude/logs/debug.log
```

### Can't find a specific entry
```bash
# Check file size
ls -lh ~/.claude/logs/debug.log

# Search with timestamps
grep "2026-05-04" ~/.claude/logs/debug.log | less
```

### JSON parsing errors
```bash
# Validate JSON
grep "\[LLM\] Send request to LLM:" ~/.claude/logs/debug.log | \
  tail -1 | \
  sed 's/.*Send request to LLM: //' | \
  jq empty && echo "Valid JSON" || echo "Invalid JSON"
```

---

## See Also

- [Architecture Documentation](../ARCHITECTURE.md) - Understanding the system
- [Sequence Diagrams](sequence-diagram.md) - Request flow visualization
- [Authentication Flow](authentication-flow.md) - Auth system details
- [Example Queries](../examples/) - Sample queries with logs
