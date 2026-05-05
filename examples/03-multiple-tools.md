# Example 3: Multiple Tool Usage

This example shows a complex query requiring multiple tool executions across several turns.

## Query

```bash
echo "Find all TypeScript files, read package.json, and create a summary report" | ./bin/claude-code-insideout -p
```

## What Happens

This query requires Claude to:
1. Use **Bash** tool to find TypeScript files
2. Use **Read** tool to read package.json
3. Use **Write** tool to create a summary report

Each tool execution creates a new turn in the query loop.

## Expected Log Flow

### Turn 1: Find TypeScript Files

```log
[2026-05-03T10:10:00.000Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 1
[2026-05-03T10:10:00.500Z] [TRACE] [LLM] message_stop - stop_reason: tool_use
[2026-05-03T10:10:00.501Z] [TRACE] [QUERY] Tool use blocks found: Bash
[2026-05-03T10:10:00.502Z] [TRACE] [TOOL] Executing Bash tool
[2026-05-03T10:10:00.503Z] [INFO] [PERMISSION] Checking permission for: Bash(command="find . -name '*.ts' -type f")
[2026-05-03T10:10:00.504Z] [INFO] [PERMISSION] Prompting user for approval...
[2026-05-03T10:10:05.000Z] [INFO] [PERMISSION] Permission granted by user
[2026-05-03T10:10:05.100Z] [TRACE] [TOOL] Bash tool completed - exit code: 0, output length: 523
```

**Note**: Bash tool required user approval (5 second delay).

### Turn 2: Read package.json

```log
[2026-05-03T10:10:05.200Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 2
[2026-05-03T10:10:05.300Z] [TRACE] [LLM] message_start usage - input_tokens: 9200, cache_read_input_tokens: 8000
[2026-05-03T10:10:06.000Z] [TRACE] [LLM] message_stop - stop_reason: tool_use
[2026-05-03T10:10:06.001Z] [TRACE] [QUERY] Tool use blocks found: Read
[2026-05-03T10:10:06.050Z] [TRACE] [TOOL] Read tool completed - content length: 2456
```

### Turn 3: Create Summary Report

```log
[2026-05-03T10:10:06.100Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 3
[2026-05-03T10:10:07.000Z] [TRACE] [LLM] message_stop - stop_reason: tool_use
[2026-05-03T10:10:07.001Z] [TRACE] [QUERY] Tool use blocks found: Write
[2026-05-03T10:10:07.002Z] [INFO] [PERMISSION] Checking permission for: Write(file_path="summary-report.md")
[2026-05-03T10:10:07.003Z] [INFO] [PERMISSION] Permission granted (auto-allowed)
[2026-05-03T10:10:07.050Z] [TRACE] [TOOL] Write tool completed - bytes written: 1843
```

### Turn 4: Final Response

```log
[2026-05-03T10:10:07.100Z] [TRACE] [QUERY] Starting API call iteration - turnCount: 4
[2026-05-03T10:10:07.200Z] [TRACE] [LLM] message_start usage - input_tokens: 12500, cache_read_input_tokens: 8000
[2026-05-03T10:10:08.500Z] [TRACE] [LLM] message_stop - stop_reason: end_turn
[2026-05-03T10:10:08.501Z] [TRACE] [QUERY] Query completed successfully
```

## Complete Message Chain

```
Turn 1:
├─ user: "Find all TypeScript files, read package.json, and create a summary report"
├─ assistant: tool_use(Bash, find command)
└─ user: tool_result(file list)

Turn 2:
└─ assistant: tool_use(Read, package.json)
└─ user: tool_result(package.json content)

Turn 3:
└─ assistant: tool_use(Write, summary-report.md)
└─ user: tool_result(write confirmation)

Turn 4:
└─ assistant: "I've created the summary report..."
```

## Statistics

### Tool Execution Summary

| Turn | Tool | Permission | Duration | Result |
|------|------|-----------|----------|--------|
| 1 | Bash | User prompted | ~5.1s | 523 bytes output |
| 2 | Read | Auto-allowed | ~0.05s | 2,456 bytes read |
| 3 | Write | Auto-allowed | ~0.05s | 1,843 bytes written |

### Token Usage

| Turn | Input Tokens | Cached Tokens | Output Tokens | Stop Reason |
|------|--------------|---------------|---------------|-------------|
| 1 | 8,500 | 8,000 (first) | 120 | tool_use |
| 2 | 9,200 | 8,000 (cached) | 110 | tool_use |
| 3 | 11,000 | 8,000 (cached) | 130 | tool_use |
| 4 | 12,500 | 8,000 (cached) | 280 | end_turn |
| **Total** | **41,200** | **32,000** | **640** | |

**Effective input tokens** (without cache): 41,200 - 24,000 = **17,200 tokens**

### Timeline

```
0.0s  - Query starts
0.5s  - Turn 1: LLM decides to use Bash
5.1s  - Bash tool completes (user approval delay)
5.3s  - Turn 2: LLM decides to use Read  
5.4s  - Read tool completes
5.5s  - Turn 3: LLM decides to use Write
5.6s  - Write tool completes
5.7s  - Turn 4: LLM generates final response
8.5s  - Query completes
────────────────────────────────────
Total: 8.5 seconds
```

## Message Growth Pattern

Watch how the messages array grows with each tool use:

```log
[TRACE] [QUERY] Starting API call iteration - turnCount: 1, messagesForQuery.length: 1
[TRACE] [QUERY] Starting API call iteration - turnCount: 2, messagesForQuery.length: 3
[TRACE] [QUERY] Starting API call iteration - turnCount: 3, messagesForQuery.length: 5
[TRACE] [QUERY] Starting API call iteration - turnCount: 4, messagesForQuery.length: 7
```

Pattern: `messages.length = 1 + (2 * tools_executed)`

## Prompt Caching Benefits

Without prompt caching:
- Would send 8,000 tokens (tools) × 4 turns = **32,000 tokens**

With prompt caching:
- Turn 1: 8,000 tokens written to cache
- Turns 2-4: Read from cache (only charged for 10% of cached tokens)
- **Effective cost**: 8,000 + (3 × 800) = **10,400 tokens**
- **Savings**: 67%!

## Permission Patterns

```log
# Bash - requires approval (dangerous command)
[INFO] [PERMISSION] Prompting user for approval...

# Read - auto-allowed (safe operation)
[INFO] [PERMISSION] Permission granted (auto-allowed)

# Write - auto-allowed if file doesn't exist
[INFO] [PERMISSION] Permission granted (auto-allowed)
```

Permission can be configured in `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(find *)",
      "Read(**/*.json)",
      "Write(summary-*.md)"
    ]
  }
}
```

## Analyze This Query's Logs

```bash
# Count tool executions
grep -c "Tool use blocks found" ~/.claude/logs/debug.log

# See all tools used
grep "Tool use blocks found:" ~/.claude/logs/debug.log

# Check permission decisions
grep "\[PERMISSION\]" ~/.claude/logs/debug.log

# View message growth
grep "messagesForQuery.length:" ~/.claude/logs/debug.log

# See caching efficiency
grep "cache_read_input_tokens" ~/.claude/logs/debug.log

# Calculate total duration
first=$(grep "turnCount: 1" ~/.claude/logs/debug.log | head -1 | cut -d'[' -f2 | cut -d']' -f1)
last=$(grep "Query completed" ~/.claude/logs/debug.log | tail -1 | cut -d'[' -f2 | cut -d']' -f1)
echo "First: $first"
echo "Last: $last"
```

## Performance Optimization

### What Makes This Query Slow?
1. **User permission prompts**: 5 seconds waiting for approval
2. **Multiple API roundtrips**: 4 separate LLM calls
3. **Bash execution**: External process overhead

### How to Speed It Up?
1. **Pre-approve tools**: Add patterns to `.claude/settings.json`
2. **Batch operations**: Ask Claude to plan all tools upfront
3. **Use specific commands**: More specific = faster approval

Example optimized settings:

```json
{
  "permissions": {
    "allow": [
      "Bash(find . -name '*.ts')",
      "Read(**/*.json)",
      "Write(summary-*.md)"
    ]
  }
}
```

With these settings, user approval time drops from 5s → 0s!

## Comparison Table

| Query Type | Turns | Tools | Total Time | Complexity |
|-----------|-------|-------|-----------|-----------|
| Simple | 1 | 0 | ~2s | Low |
| Single Tool | 2 | 1 | ~3s | Medium |
| **Multiple Tools** | **4** | **3** | **~8.5s** | **High** |

## Next Example

See [Example 4](04-error-handling.md) for what happens when tools fail or errors occur.
