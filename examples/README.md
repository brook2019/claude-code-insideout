# Example Queries

This directory contains detailed examples of different query types with their expected log output. Each example explains what happens internally when you interact with Claude Code.

## 📚 Available Examples

### [01 - Simple Query](01-simple-query.md)
**Complexity**: ⭐ Basic  
**Duration**: ~2 seconds  
**Tools used**: None

A straightforward question-answer interaction without tool usage.

**What you'll learn:**
- Basic request/response flow
- Log components and their roles
- Token usage for simple queries
- Authentication process
- Stop reasons

**Example query:**
```bash
echo "Explain how HTTP requests work" | ./bin/claude-code-insideout -p
```

---

### [02 - Tool Usage](02-tool-usage.md)
**Complexity**: ⭐⭐ Intermediate  
**Duration**: ~3 seconds  
**Tools used**: Read

A multi-turn interaction where Claude needs to read a file.

**What you'll learn:**
- Multi-turn query loops
- Tool execution flow
- Tool result handling
- Prompt caching in action
- Message array growth
- Permission system basics

**Example query:**
```bash
echo "Read and summarize the README.md file" | ./bin/claude-code-insideout -p
```

**Key insights:**
- See how `stop_reason: tool_use` triggers another turn
- Observe prompt caching saving 50% of tokens
- Understand tool_result message structure

---

### [03 - Multiple Tools](03-multiple-tools.md)
**Complexity**: ⭐⭐⭐ Advanced  
**Duration**: ~8.5 seconds  
**Tools used**: Bash, Read, Write

A complex query requiring multiple tool executions across several turns.

**What you'll learn:**
- Multi-tool orchestration
- Permission prompts and approval
- Prompt caching efficiency (67% savings!)
- Message chain growth pattern
- Performance optimization strategies

**Example query:**
```bash
echo "Find all TypeScript files, read package.json, and create a summary report" | ./bin/claude-code-insideout -p
```

**Key insights:**
- 4 turns with 3 tool executions
- User approval workflow
- Caching prevents resending 8,000 tokens 3 times
- Total token usage: 41,200 input, 640 output

---

### [04 - Error Handling](04-error-handling.md)
**Complexity**: ⭐⭐ Intermediate  
**Topics**: Error scenarios, retries, recovery

What happens when things go wrong and how errors are logged.

**Scenarios covered:**
1. **File Not Found**: Tool failure, error in tool_result
2. **Permission Denied**: User rejects dangerous command
3. **API Error**: Network failure with retry logic
4. **Invalid Tool Input**: Validation errors and recovery

**What you'll learn:**
- Error log patterns
- Retry mechanisms
- Permission safety checks
- Error recovery strategies
- Log analysis for debugging

**Key insights:**
- Errors don't crash the system
- Claude can handle and respond to errors
- Automatic retries for network issues
- Permission system prevents dangerous operations

---

## 🎯 How to Use These Examples

### 1. Read the Example
Start by reading the markdown file to understand what will happen.

### 2. Run the Query
Execute the example command in your terminal.

### 3. Watch the Logs
In another terminal, watch logs in real-time:
```bash
tail -f ~/.claude/logs/debug.log
```

### 4. Analyze the Results
After completion, run the log analyzer:
```bash
./scripts/analyze-logs.sh
```

### 5. Compare
Compare your actual logs with the expected output in the example.

---

## 📊 Quick Comparison

| Example | Turns | Tools | Duration | Input Tokens | Output Tokens |
|---------|-------|-------|----------|--------------|---------------|
| Simple Query | 1 | 0 | ~2s | 1,200 | 450 |
| Tool Usage | 2 | 1 | ~3s | 19,000 | 530 |
| Multiple Tools | 4 | 3 | ~8.5s | 41,200 | 640 |
| Error Handling | 2-3 | varies | ~3-15s | varies | varies |

---

## 🔍 Log Filtering Cheatsheet

### Filter by Component
```bash
# See only LLM interactions
grep "\[LLM\]" ~/.claude/logs/debug.log

# See only queries
grep "\[QUERY\]" ~/.claude/logs/debug.log

# See authentication
grep "\[AUTH\]" ~/.claude/logs/debug.log
```

### Filter by Event
```bash
# See tool executions
grep "Tool use blocks found" ~/.claude/logs/debug.log

# See stop reasons
grep "stop_reason:" ~/.claude/logs/debug.log

# See errors
grep "\[ERROR\]" ~/.claude/logs/debug.log

# See token usage
grep "tokens:" ~/.claude/logs/debug.log
```

### Filter by Time
```bash
# Last hour
grep "$(date -u -v-1H +%Y-%m-%dT%H)" ~/.claude/logs/debug.log

# Specific minute
grep "2026-05-03T10:30" ~/.claude/logs/debug.log

# Today's logs
grep "$(date -u +%Y-%m-%d)" ~/.claude/logs/debug.log
```

### Count Patterns
```bash
# Count queries
grep -c "query() called" ~/.claude/logs/debug.log

# Count tool uses
grep -c "Tool use blocks found" ~/.claude/logs/debug.log

# Count errors
grep -c "\[ERROR\]" ~/.claude/logs/debug.log
```

---

## 🛠️ Create Your Own Examples

Want to create your own example queries? Follow this template:

### Template Structure
```markdown
# Example N: [Title]

## Query
[The command to run]

## What Happens
[Describe what Claude will do]

## Expected Log Flow
[Show the key log entries]

## Key Observations
[Explain the important patterns]

## Filter Logs
[Commands to analyze this query]
```

### Tips for Good Examples
- ✅ Start with a clear, specific query
- ✅ Explain why Claude chose each action
- ✅ Highlight interesting log patterns
- ✅ Show token usage and timing
- ✅ Include filtering commands
- ✅ Add comparisons with other examples

---

## 📖 Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Deep dive into system components
- [Sequence Diagram](../docs/sequence-diagram.md) - Visual request flow
- [Log Analyzer](../scripts/analyze-logs.sh) - Automated log analysis
- [README](../README.md) - Main project documentation

---

## 🎓 Learning Path

**Beginner**: Start with Example 1  
↓  
**Intermediate**: Move to Examples 2 and 4  
↓  
**Advanced**: Study Example 3  
↓  
**Expert**: Create your own examples!

---

## 💡 Pro Tips

1. **Run examples in order** - Each builds on previous concepts
2. **Watch logs live** - Use `tail -f` while running queries
3. **Use the analyzer** - Run `./scripts/analyze-logs.sh` after each example
4. **Compare actual vs expected** - Your logs may differ slightly
5. **Experiment** - Modify queries to see how behavior changes
6. **Share your findings** - Create PR with interesting examples!

---

## 🤝 Contributing

Found an interesting query pattern? Create an example and submit a PR!

**Good example candidates:**
- Queries with unusual tool combinations
- Edge cases and error scenarios
- Performance optimization techniques
- Complex multi-step workflows
- Interesting caching patterns

---

## Questions?

- Check [ARCHITECTURE.md](../ARCHITECTURE.md) for component details
- Review logs with `./scripts/analyze-logs.sh`
- Open an issue on GitHub
- Read the [sequence diagram](../docs/sequence-diagram.md)
