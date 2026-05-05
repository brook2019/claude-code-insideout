# Example 4: Error Handling

This example demonstrates what happens when things go wrong and how errors are logged.

## Scenario 1: File Not Found

### Query

```bash
echo "Read the file nonexistent.txt" | ./bin/claude-code-insideout -p
```

### Expected Log Flow

```log
[2026-05-03T10:15:00.000Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 1
[2026-05-03T10:15:00.500Z] [TRACE] [LLM] message_stop - stop_reason: tool_use
[2026-05-03T10:15:00.501Z] [TRACE] [QUERY] Tool use blocks found: Read
[2026-05-03T10:15:00.502Z] [TRACE] [TOOL] Executing Read tool with input: {file_path: "nonexistent.txt"}
[2026-05-03T10:15:00.503Z] [ERROR] [TOOL] Read tool failed: ENOENT: no such file or directory, open 'nonexistent.txt'
[2026-05-03T10:15:00.504Z] [TRACE] [QUERY] Added tool_result with error to messages
```

### Turn 2: Claude Handles the Error

```log
[2026-05-03T10:15:00.600Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 2
[2026-05-03T10:15:01.500Z] [TRACE] [LLM] message_stop - stop_reason: end_turn
[2026-05-03T10:15:01.501Z] [TRACE] [QUERY] Query completed successfully
```

**Claude's response**: "I apologize, but the file `nonexistent.txt` doesn't exist. Would you like me to help you find the file or create it?"

### Key Points

- ❌ Tool execution fails
- ✅ Error is captured and logged
- ✅ Error details sent back to Claude in tool_result
- ✅ Claude acknowledges the error gracefully
- ✅ Query still completes successfully (stop_reason: end_turn)

---

## Scenario 2: Permission Denied

### Query

```bash
echo "Delete all files in the system" | ./bin/claude-code-insideout -p
```

### Expected Log Flow

```log
[2026-05-03T10:20:00.000Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 1
[2026-05-03T10:20:00.500Z] [TRACE] [LLM] message_stop - stop_reason: tool_use
[2026-05-03T10:20:00.501Z] [TRACE] [QUERY] Tool use blocks found: Bash
[2026-05-03T10:20:00.502Z] [INFO] [PERMISSION] Checking permission for: Bash(command="rm -rf /")
[2026-05-03T10:20:00.503Z] [WARN] [PERMISSION] Dangerous command detected: rm -rf
[2026-05-03T10:20:00.504Z] [INFO] [PERMISSION] Prompting user for approval...
[2026-05-03T10:20:05.000Z] [WARN] [PERMISSION] User denied permission
[2026-05-03T10:20:05.001Z] [ERROR] [TOOL] Tool execution aborted: Permission denied by user
[2026-05-03T10:20:05.002Z] [TRACE] [QUERY] Added tool_result with permission_denied error
```

### Turn 2: Claude Acknowledges Permission Denial

```log
[2026-05-03T10:20:05.100Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 2
[2026-05-03T10:20:06.000Z] [TRACE] [LLM] message_stop - stop_reason: end_turn
```

**Claude's response**: "I understand that you denied permission for that command. It's a dangerous operation that could delete important files. Is there something specific you'd like to delete instead?"

### Safety Mechanisms

1. **Pattern matching**: Dangerous patterns like `rm -rf` trigger warnings
2. **User prompt**: Always asks for confirmation on destructive commands
3. **Explicit denial**: User can reject any tool execution
4. **Graceful handling**: Claude receives the denial and responds appropriately

---

## Scenario 3: API Error

### Query

```bash
# Simulate network error by disconnecting internet
echo "Explain quantum computing" | ./bin/claude-code-insideout -p
```

### Expected Log Flow

```log
[2026-05-03T10:25:00.000Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 1
[2026-05-03T10:25:00.050Z] [TRACE] [LLM] queryModelWithVCR called
[2026-05-03T10:25:00.100Z] [TRACE] [CLIENT] getAnthropicClient called
[2026-05-03T10:25:00.150Z] [TRACE] [LLM] API Request - model: claude-sonnet-4.5
[2026-05-03T10:25:05.000Z] [ERROR] [LLM] Streaming error occurred - type: FetchError, message: request to https://api.anthropic.com/v1/messages failed, reason: connect ECONNREFUSED
[2026-05-03T10:25:05.001Z] [ERROR] [QUERY] Query error caught - type: APIConnectionError, message: Unable to connect to API
[2026-05-03T10:25:05.002Z] [ERROR] [QUERY] Stack trace: Error: Unable to connect to API
    at Object.createClient (client.ts:340:15)
    at queryModelWithVCR (claude.ts:2450:20)
```

### Retry Logic

```log
[2026-05-03T10:25:05.100Z] [INFO] [QUERY] Retrying request - attempt 2 of 3
[2026-05-03T10:25:10.000Z] [ERROR] [LLM] Streaming error occurred - type: FetchError
[2026-05-03T10:25:10.001Z] [INFO] [QUERY] Retrying request - attempt 3 of 3
[2026-05-03T10:25:15.000Z] [ERROR] [LLM] Streaming error occurred - type: FetchError
[2026-05-03T10:25:15.001Z] [ERROR] [QUERY] Max retries exceeded, query failed
[2026-05-03T10:25:15.002Z] [ERROR] [REPL] Error in query() loop: Unable to connect to API. Check your internet connection
```

### User Feedback

The UI displays:
```
⎿ Unable to connect to API. Check your internet connection
```

### Retry Configuration

- **Default retries**: 3 attempts
- **Backoff**: Exponential (5s, 10s, 15s)
- **Retryable errors**: Network errors, 429 rate limits, 500 server errors
- **Non-retryable**: 401 auth errors, 400 bad requests

---

## Scenario 4: Invalid Tool Input

### Query

```bash
echo "Read file without specifying which file" | ./bin/claude-code-insideout -p
```

### Expected Log Flow

```log
[2026-05-03T10:30:00.500Z] [TRACE] [LLM] message_stop - stop_reason: tool_use
[2026-05-03T10:30:00.501Z] [TRACE] [QUERY] Tool use blocks found: Read
[2026-05-03T10:30:00.502Z] [ERROR] [TOOL] Read tool validation failed: Missing required parameter: file_path
[2026-05-03T10:30:00.503Z] [TRACE] [QUERY] Added tool_result with validation_error
```

### Turn 2: Claude Corrects Itself

Claude receives the validation error and usually tries again with correct parameters:

```log
[2026-05-03T10:30:00.600Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 2
[2026-05-03T10:30:01.000Z] [TRACE] [LLM] message_stop - stop_reason: tool_use
[2026-05-03T10:30:01.001Z] [TRACE] [QUERY] Tool use blocks found: Read
[2026-05-03T10:30:01.002Z] [TRACE] [TOOL] Executing Read tool with input: {file_path: "README.md"}
[2026-05-03T10:30:01.050Z] [TRACE] [TOOL] Read tool completed successfully
```

---

## Error Log Analysis

### Find All Errors

```bash
# List all errors
grep "\[ERROR\]" ~/.claude/logs/debug.log

# Count errors by component
grep "\[ERROR\]" ~/.claude/logs/debug.log | \
  sed -E 's/.*\[ERROR\] \[([^\]]+)\].*/\1/' | \
  sort | uniq -c

# Show recent errors
grep "\[ERROR\]" ~/.claude/logs/debug.log | tail -10
```

### Error Categories

| Component | Common Errors |
|-----------|---------------|
| **TOOL** | File not found, permission denied, validation errors |
| **LLM** | Network errors, streaming errors, timeout |
| **QUERY** | Max retries exceeded, query loop errors |
| **CLIENT** | Auth errors, invalid configuration |
| **AUTH** | Token expired, invalid credentials |

### Error Response Times

```bash
# Find query duration for failed queries
grep -B5 "\[ERROR\].*Query error" ~/.claude/logs/debug.log | \
  grep "Starting API call"
```

---

## Best Practices for Error Handling

### 1. Check Logs First

Always check logs when something goes wrong:
```bash
tail -100 ~/.claude/logs/debug.log | grep "\[ERROR\]"
```

### 2. Use the Log Analyzer

```bash
./scripts/analyze-logs.sh
```

Look at the "ERROR ANALYSIS" section.

### 3. Filter by Time Range

If you know when the error occurred:
```bash
grep "2026-05-03T10:25" ~/.claude/logs/debug.log | grep "\[ERROR\]"
```

### 4. Check Stack Traces

Errors include stack traces for debugging:
```log
[ERROR] [QUERY] Stack trace: Error: Unable to connect to API
    at Object.createClient (client.ts:340:15)
    at queryModelWithVCR (claude.ts:2450:20)
    at query (query.ts:663:25)
```

### 5. Monitor Warnings

Warnings often precede errors:
```bash
grep "\[WARN\]" ~/.claude/logs/debug.log
```

---

## Error Recovery

### Automatic Recovery

- ✅ **Network errors**: Auto-retry with backoff
- ✅ **Rate limits**: Auto-retry after delay
- ✅ **Tool failures**: Error sent to Claude, Claude can retry

### Manual Recovery

- ❌ **Auth errors**: Update environment variables and restart
- ❌ **Permission denied**: Update `.claude/settings.json` or retry
- ❌ **Invalid input**: Rephrase query or fix parameters

---

## Summary

| Error Type | Logged As | Retryable | User Action Required |
|-----------|-----------|-----------|---------------------|
| File not found | ERROR (TOOL) | No | Check file path |
| Permission denied | WARN (PERMISSION) | No | Approve or modify |
| Network error | ERROR (LLM) | Yes | Wait or check connection |
| Auth failure | ERROR (AUTH) | No | Fix credentials |
| Invalid input | ERROR (TOOL) | No | Claude usually retries |
| Rate limit | WARN (LLM) | Yes | Automatic retry |

---

## Next Steps

- [Run the log analyzer](../scripts/analyze-logs.sh) to see error statistics
- Check [ARCHITECTURE.md](../ARCHITECTURE.md) for component details
- Review [sequence diagram](../docs/sequence-diagram.md) for error flow
