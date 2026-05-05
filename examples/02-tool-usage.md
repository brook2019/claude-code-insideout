# Example 2: Query with Tool Usage

This example demonstrates a multi-turn interaction where Claude needs to read a file.

## Query

```bash
echo "Read and summarize the README.md file" | ./bin/claude-code-insideout -p
```

## What Happens

1. User asks Claude to read a file
2. Claude determines it needs the **Read** tool
3. Query loop continues with tool_use
4. Read tool executes (may prompt for permission)
5. Tool result is added to messages
6. Query continues with tool result
7. Claude provides summary based on file content

## Expected Log Flow

### Turn 1: Initial Request + Tool Decision

```log
[2026-05-03T10:05:00.000Z] [TRACE] [INPUT] Input is: Read and summarize the README.md file
[2026-05-03T10:05:00.001Z] [TRACE] [PROCESS_INPUT] processUserInput called - mode: prompt, inputString: Read and summarize the README.md file, skipSlashCommands: false
[2026-05-03T10:05:00.010Z] [TRACE] [REPL] onQuery called - shouldQuery: true, newMessages.length: 1
[2026-05-03T10:05:00.011Z] [TRACE] [REPL] Query guard acquired, generation: 1
[2026-05-03T10:05:00.020Z] [TRACE] [QUERY] query() called - messages.length: 1
[2026-05-03T10:05:00.021Z] [TRACE] [QUERY] Entering API call loop - attemptWithFallback: true
[2026-05-03T10:05:00.022Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 1, model: claude-sonnet-4.5, messagesForQuery.length: 1
[2026-05-03T10:05:00.023Z] [TRACE] [LLM] queryModelWithVCR called - messages.length: 1, tools.length: 22, model: claude-sonnet-4.5
[2026-05-03T10:05:00.050Z] [TRACE] [LLM] API Request - model: claude-sonnet-4.5, max_tokens: 32000, messages.length: 1, tools.length: 22
[2026-05-03T10:05:00.500Z] [TRACE] [LLM] message_start usage - input_tokens: 8500, cache_creation_input_tokens: 8000, cache_read_input_tokens: 0
```

**Note**: High input_tokens because all 22 tools are sent in the request.

```log
[2026-05-03T10:05:01.000Z] [TRACE] [LLM] content_block_delta - tool_use chunk
[2026-05-03T10:05:01.200Z] [TRACE] [LLM] message_stop - stop_reason: tool_use, usage: input=8500, output=150
[2026-05-03T10:05:01.201Z] [TRACE] [QUERY] Received message from API - type: message
[2026-05-03T10:05:01.202Z] [TRACE] [QUERY] Assistant message - stop_reason: tool_use, content blocks: 1
[2026-05-03T10:05:01.203Z] [TRACE] [QUERY] Tool use blocks found: Read
```

### Tool Execution

```log
[2026-05-03T10:05:01.204Z] [TRACE] [TOOL] Executing Read tool with input: {file_path: "README.md"}
[2026-05-03T10:05:01.205Z] [INFO] [PERMISSION] Checking permission for: Read(file_path="README.md")
[2026-05-03T10:05:01.206Z] [INFO] [PERMISSION] Permission granted (auto-allowed)
[2026-05-03T10:05:01.250Z] [TRACE] [TOOL] Read tool completed successfully, content length: 15234 bytes
[2026-05-03T10:05:01.251Z] [TRACE] [QUERY] Added tool_result to messages
```

### Turn 2: Tool Result + Final Response

```log
[2026-05-03T10:05:01.252Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 2, model: claude-sonnet-4.5, messagesForQuery.length: 3
[2026-05-03T10:05:01.253Z] [TRACE] [LLM] queryModelWithVCR called - messages.length: 3, tools.length: 22, model: claude-sonnet-4.5
[2026-05-03T10:05:01.280Z] [TRACE] [LLM] API Request - model: claude-sonnet-4.5, max_tokens: 32000, messages.length: 3, tools.length: 22
[2026-05-03T10:05:01.500Z] [TRACE] [LLM] message_start usage - input_tokens: 10500, cache_creation_input_tokens: 0, cache_read_input_tokens: 8000
```

**Note**: `cache_read_input_tokens: 8000` - Prompt caching in action! The 22 tools are read from cache, saving tokens and money.

```log
[2026-05-03T10:05:02.000Z] [TRACE] [LLM] content_block_delta - text chunk received
[2026-05-03T10:05:02.500Z] [TRACE] [LLM] content_block_delta - text chunk received
[2026-05-03T10:05:03.000Z] [TRACE] [LLM] message_delta usage - output_tokens: 380
[2026-05-03T10:05:03.001Z] [TRACE] [LLM] message_stop - stop_reason: end_turn, usage: input=10500, output=380
[2026-05-03T10:05:03.002Z] [TRACE] [QUERY] Received message from API - type: message
[2026-05-03T10:05:03.003Z] [TRACE] [QUERY] Assistant message - stop_reason: end_turn, content blocks: 1
[2026-05-03T10:05:03.004Z] [TRACE] [REPL] Query completed for generation: 1
```

## Key Observations

### Multi-Turn Interaction
- **Turn 1**: User message → LLM decides to use Read tool
- **Turn 2**: Tool result added → LLM provides final answer

### Stop Reasons
- **Turn 1**: `stop_reason: tool_use` (needs to execute tool)
- **Turn 2**: `stop_reason: end_turn` (task complete)

### Token Usage Breakdown

| Phase | Input Tokens | Output Tokens | Notes |
|-------|--------------|---------------|-------|
| Turn 1 | 8,500 | 150 | All tools sent (8K cached) |
| Turn 2 | 10,500 | 380 | Tools read from cache |
| **Total** | **19,000** | **530** | |

### Prompt Caching Savings
- **Without caching**: Would need to send 8,000 tokens twice = 16,000 input tokens
- **With caching**: Only 2,500 new tokens in Turn 2
- **Savings**: 50% reduction in input tokens!

### Timeline
- **Total time**: ~3 seconds
- **Turn 1**: 1.2s (LLM decision)
- **Tool execution**: 50ms (file read)
- **Turn 2**: 1.5s (LLM generates summary)

## Message Flow

```
Messages array growth:

Turn 1 Start:
[
  {role: "user", content: "Read and summarize the README.md file"}
]

After Turn 1:
[
  {role: "user", content: "Read and summarize the README.md file"},
  {role: "assistant", content: [{type: "tool_use", name: "Read", ...}]},
  {role: "user", content: [{type: "tool_result", tool_use_id: "...", content: "README content..."}]}
]

Turn 2: All 3 messages sent to API
```

## Filter Logs for This Query

```bash
# See all turns
grep "turnCount:" ~/.claude/logs/debug.log

# View tool usage
grep "Tool use blocks found" ~/.claude/logs/debug.log

# Check prompt caching
grep "cache_read_input_tokens" ~/.claude/logs/debug.log

# See stop reasons for each turn
grep "stop_reason:" ~/.claude/logs/debug.log
```

## Permission System in Action

When the Read tool is executed, the logs show:

```log
[INFO] [PERMISSION] Checking permission for: Read(file_path="README.md")
[INFO] [PERMISSION] Permission granted (auto-allowed)
```

If permission was denied:
```log
[INFO] [PERMISSION] Permission denied by user
[ERROR] [TOOL] Tool execution aborted: permission denied
```

## Comparison with Simple Query

| Aspect | Simple Query | Tool-Using Query |
|--------|-------------|------------------|
| Turns | 1 | 2 |
| Stop reasons | end_turn | tool_use → end_turn |
| Input tokens | ~1,200 | ~19,000 |
| Output tokens | ~450 | ~530 |
| Tool executions | 0 | 1 (Read) |
| Duration | ~2s | ~3s |
| Complexity | Low | Medium |

## Next Steps

- See [Example 3](03-multiple-tools.md) for queries using multiple tools
- See [Example 4](04-error-handling.md) for error scenarios
