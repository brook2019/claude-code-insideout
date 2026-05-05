# Example 1: Simple Query

This example shows a basic question-answer interaction without tool usage.

## Query

```bash
echo "Explain how HTTP requests work" | ./bin/claude-code-insideout -p
```

## What Happens

1. User input is captured
2. Input is processed and validated
3. A user message is created
4. The query is sent to the LLM
5. The LLM responds with a text explanation
6. Response is displayed to user

## Expected Log Flow

```log
[2026-05-03T10:00:00.000Z] [TRACE] [INPUT] Input is: Explain how HTTP requests work
[2026-05-03T10:00:00.001Z] [TRACE] [PROCESS_INPUT] processUserInput called - mode: prompt, inputString: Explain how HTTP requests work, skipSlashCommands: false
[2026-05-03T10:00:00.002Z] [TRACE] [PROCESS_INPUT] Created user message with 1 content blocks
[2026-05-03T10:00:00.003Z] [TRACE] [PROMPT] handlePromptSubmit called with input: Explain how HTTP requests work, mode: prompt
[2026-05-03T10:00:00.004Z] [TRACE] [PROMPT] processUserInput result: shouldQuery=true, messages.length=1, model=default
[2026-05-03T10:00:00.005Z] [TRACE] [PROMPT] Calling onQuery - shouldQuery=true, allowedTools=[], model=claude-sonnet-4.5, primaryInput="Explain how HTTP requests work", newMessages.length=1
[2026-05-03T10:00:00.006Z] [TRACE] [REPL] onQuery called - shouldQuery: true, newMessages.length: 1, model: claude-sonnet-4.5
[2026-05-03T10:00:00.007Z] [TRACE] [REPL] Query guard acquired, generation: 1
[2026-05-03T10:00:00.008Z] [TRACE] [REPL] onQueryImpl started - shouldQuery: true, messagesIncludingNewMessages.length: 1
[2026-05-03T10:00:00.009Z] [TRACE] [REPL] Starting query() generator loop
[2026-05-03T10:00:00.010Z] [TRACE] [QUERY] query() called - messages.length: 1, model: undefined, systemPrompt length: 8
[2026-05-03T10:00:00.011Z] [TRACE] [REPL] Received event from query() - type: stream_request_start
[2026-05-03T10:00:00.012Z] [TRACE] [QUERY] Entering API call loop - attemptWithFallback: true
[2026-05-03T10:00:00.013Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 1, model: claude-sonnet-4.5, messagesForQuery.length: 1
[2026-05-03T10:00:00.014Z] [TRACE] [LLM] queryModelWithVCR called - messages.length: 1, tools.length: 22, model: claude-sonnet-4.5
[2026-05-03T10:00:00.015Z] [TRACE] [CLIENT] getAnthropicClient called - model: claude-sonnet-4.5, USE_BEDROCK: undefined, SKIP_BEDROCK_AUTH: undefined
[2026-05-03T10:00:00.016Z] [TRACE] [AUTH] OAuth token check starting
[2026-05-03T10:00:00.017Z] [TRACE] [AUTH] OAuth token check complete
[2026-05-03T10:00:00.018Z] [TRACE] [AUTH] Using ANTHROPIC_AUTH_TOKEN
[2026-05-03T10:00:00.019Z] [TRACE] [CLIENT] Creating client with auth headers
[2026-05-03T10:00:00.020Z] [TRACE] [LLM] API Request - model: claude-sonnet-4.5, max_tokens: 32000, messages.length: 1, tools.length: 22
[2026-05-03T10:00:00.500Z] [TRACE] [LLM] message_start usage - input_tokens: 1200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0
[2026-05-03T10:00:01.000Z] [TRACE] [LLM] content_block_delta - text chunk received
[2026-05-03T10:00:01.500Z] [TRACE] [LLM] content_block_delta - text chunk received
[2026-05-03T10:00:02.000Z] [TRACE] [LLM] message_delta usage - output_tokens: 450
[2026-05-03T10:00:02.001Z] [TRACE] [LLM] message_stop - stop_reason: end_turn, usage: input=1200, output=450
[2026-05-03T10:00:02.002Z] [TRACE] [QUERY] Received message from API - type: message
[2026-05-03T10:00:02.003Z] [TRACE] [QUERY] Assistant message - stop_reason: end_turn, content blocks: 1
[2026-05-03T10:00:02.004Z] [TRACE] [REPL] Query completed for generation: 1
```

## Key Observations

### Component Activity
- **INPUT**: Captures raw user input
- **PROCESS_INPUT**: Validates and structures the input
- **PROMPT**: Handles submission logic
- **REPL**: Orchestrates the query
- **QUERY**: Manages the request/response loop
- **LLM**: Handles API communication
- **CLIENT**: Creates and configures the API client
- **AUTH**: Manages authentication

### Token Usage
- **Input tokens**: ~1200 (system prompt + user message)
- **Output tokens**: ~450 (LLM response)
- **Total cost**: Minimal (no tool execution overhead)

### Stop Reason
- `end_turn`: The LLM completed its response without needing tools

### Timeline
- Total time: ~2 seconds
- Most time spent: Waiting for LLM response (1.5s)
- Overhead: Minimal (<100ms)

## Filter Logs for This Query

```bash
# View only this query's logs (by time range)
grep "2026-05-03T10:00" ~/.claude/logs/debug.log

# View just the LLM interactions
grep "\[LLM\]" ~/.claude/logs/debug.log

# See token usage
grep "tokens" ~/.claude/logs/debug.log

# Check stop reason
grep "stop_reason" ~/.claude/logs/debug.log
```

## Comparison with Tool-Using Query

Unlike queries that use tools, this simple query:
- ✅ Completes in a single turn (turnCount: 1)
- ✅ No tool_use blocks in response
- ✅ stop_reason is `end_turn` (not `tool_use`)
- ✅ Faster overall (no tool execution time)
- ✅ Lower complexity in logs

See [Example 2](02-tool-usage.md) for a query that uses tools.
