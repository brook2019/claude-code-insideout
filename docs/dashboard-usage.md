# Dashboard Usage Guide

## Overview

The Claude Code Monitoring Dashboard provides real-time visualization of your queries, API calls, token usage, and tool executions. It helps you understand performance, optimize costs, and debug issues.

---

## Starting the Dashboard

### From REPL

```bash
$ claude-code-insideout

> /dashboard
Dashboard server started at http://localhost:8765
Dashboard is now running at http://localhost:8765

The dashboard will collect metrics from your queries in real-time.
To stop the dashboard, use Ctrl+C or close this session.
```

The dashboard will automatically open in your default browser.

### From Command Line

```bash
# Start Claude Code with dashboard
$ claude-code-insideout --dashboard

# Or specify a custom port
$ DASHBOARD_PORT=9000 claude-code-insideout --dashboard
```

### Environment Variables

```bash
# Enable dashboard automatically on startup
export CLAUDE_CODE_DASHBOARD_ENABLED=1

# Custom port (default: 8765)
export DASHBOARD_PORT=9000

# Custom host (default: localhost)
export DASHBOARD_HOST=127.0.0.1

# Don't auto-open browser
export DASHBOARD_NO_OPEN=1
```

---

## Dashboard Interface

### Overview Panel

The top section shows real-time aggregated metrics:

```
┌────────────────────────────────────────────────────────┐
│  Queries: 15 (2 active)                                │
│  API Requests: 42 (1 active)                           │
│  Token Usage: 125K (Input: 98K, Output: 27K)          │
│  Total Cost: $1.247                                    │
│  Avg TTFT: 1,234ms                                     │
│  Cache Hit Rate: 87%                                   │
└────────────────────────────────────────────────────────┘
```

**Metrics:**
- **Queries**: Total number of user queries and currently active
- **API Requests**: Total API calls made to Claude
- **Token Usage**: Input, output, and cached tokens
- **Total Cost**: Estimated cost based on token usage
- **Avg TTFT**: Average time to first token (latency)
- **Cache Hit Rate**: Percentage of tokens served from cache

---

### Query Timeline

Shows recent queries with status and duration:

```
Recent Queries
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query #abc123  |  5.23s  |  API: 2  |  Tools: 3  |  Tokens: 8.5K  |  Cost: $0.087
Query #def456  |  2.14s  |  API: 1  |  Tools: 1  |  Tokens: 3.2K  |  Cost: $0.034
Query #ghi789  |  In progress...
```

**Color coding:**
- 🟢 **Green border**: Completed successfully
- 🔵 **Blue border**: In progress
- 🔴 **Red border**: Error occurred

Click on a query to see detailed breakdown.

---

### Token Usage Chart

Line chart showing token consumption over time:

```
Token Usage Over Time
─────────────────────────────────────────
   │
8K │     ╭──╮
   │    ╱    ╲     ╭──
6K │   ╱      ╰───╯
   │  ╱
4K │ ╱
   │╱
   └──────────────────────────────────→ time
     Input Tokens ━━━  Output Tokens ━━━
```

**Insights:**
- Identify queries that consume many tokens
- Monitor token usage trends
- Detect cache effectiveness (fewer input tokens when cache hits)

---

### API Latency Chart

Bar chart showing average response times:

```
API Latency Distribution
─────────────────────────────────────────
TTFT       │████████ 1,234ms
Total      │████████████████ 4,567ms
```

**Metrics:**
- **TTFT (Time To First Token)**: How long until the first response arrives
- **Total Duration**: Complete API call time including streaming

**What's good:**
- TTFT < 2s: Excellent
- TTFT 2-5s: Good
- TTFT > 5s: Investigate (network issues, long system prompt, cold start)

---

### Tool Execution Stats

Shows which tools are being used and their performance:

```
Tool Execution Stats
─────────────────────────────────────────
Read       │ 45 executions  │ Avg: 125ms  │ Success: 100%
Edit       │ 12 executions  │ Avg: 543ms  │ Success: 100%
Bash       │ 8 executions   │ Avg: 1,234ms│ Success: 87.5%
Agent      │ 3 executions   │ Avg: 23.4s  │ Success: 100%
```

**Insights:**
- Most frequently used tools
- Tool execution times
- Success vs failure rates
- Identify slow or failing tools

---

### Cache Performance

Doughnut chart showing cache effectiveness:

```
Cache Performance
─────────────────────────
     ╭────────╮
    ╱  92%    ╰╮
   │   Hits    │
   │          │
    ╲        ╱
     ╰──8%──╯
       Misses

Hit Rate: 92%
Savings: $0.183
```

**Metrics:**
- **Cache Hit Rate**: Percentage of tokens served from cache
- **Cost Savings**: Money saved by using cached tokens

**Good cache performance:**
- Hit rate > 80%: Excellent
- Hit rate 50-80%: Good
- Hit rate < 50%: Check prompt structure

**Tips to improve:**
- Use consistent system prompts
- Structure prompts to maximize cache reuse
- Use ephemeral caching for tools and context

---

## Understanding Metrics

### Token Costs

| Token Type | Cost per 1K tokens |
|-----------|-------------------|
| Input | $0.003 |
| Output | $0.015 |
| Cache Read | $0.0003 (90% cheaper!) |
| Cache Creation | $0.00375 |

**Example:**
```
Query with 10K input, 2K output, 8K cached:
- Input: 2K × $0.003 = $0.006
- Cache read: 8K × $0.0003 = $0.0024
- Output: 2K × $0.015 = $0.030
Total: $0.0384

Without cache:
- Input: 10K × $0.003 = $0.030
- Output: 2K × $0.015 = $0.030
Total: $0.060

Savings: $0.0216 (36% cheaper)
```

---

### TTFT (Time To First Token)

**What affects TTFT:**
1. **System prompt length**: Longer prompts take more time to process
2. **Context size**: More messages = longer processing
3. **Tool count**: More tools = more processing
4. **Network latency**: Distance to API endpoint
5. **Model load**: First request after idle may be slower
6. **Cache status**: Cache miss forces full processing

**Typical TTFT:**
- Simple query with cache: 500-1000ms
- Complex query with tools: 1500-3000ms
- First query (cold start): 2000-5000ms

---

### Cache Hit Rate

**What is a cache hit:**
When Claude reuses previously processed tokens instead of reprocessing them.

**What gets cached:**
- System prompts (with `cache_control: ephemeral`)
- Tool definitions
- Recent conversation context
- Large documents or code

**Cache TTL (Time To Live):**
- **5 minutes**: Short-term ephemeral cache
- **1 hour**: Long-term ephemeral cache

**Why cache misses happen:**
- First query (nothing cached yet)
- Cache expired (beyond TTL)
- Prompt changed (different system prompt)
- Model changed

---

## Use Cases

### 1. Performance Debugging

**Scenario**: Queries feel slow

**Steps:**
1. Open dashboard
2. Run a slow query
3. Check TTFT and total duration
4. If TTFT is high: System prompt or context is too large
5. If total duration is high: Streaming is slow or query is complex
6. Check tool execution times for bottlenecks

---

### 2. Cost Optimization

**Scenario**: Want to reduce API costs

**Steps:**
1. Monitor token usage chart
2. Identify queries with high token counts
3. Check cache hit rate
4. Optimize:
   - Add cache controls to system prompts
   - Reduce context size
   - Use tool output truncation
   - Compact conversations more aggressively

---

### 3. Tool Analysis

**Scenario**: Want to understand tool usage patterns

**Steps:**
1. Check tool execution stats
2. Identify:
   - Most frequently used tools
   - Slow tools (optimize or reduce usage)
   - Failing tools (fix the issues)
3. Analyze tool execution sequences in query timeline

---

### 4. Cache Effectiveness

**Scenario**: Verify prompt caching is working

**Steps:**
1. Make a query
2. Wait 5 seconds
3. Make the same query again
4. Check cache hit rate (should increase)
5. If no change: Verify cache controls are set correctly

---

## Keyboard Shortcuts

- **Refresh**: `F5` or `Cmd+R` / `Ctrl+R`
- **Clear history**: Click "Clear" button (future feature)
- **Export metrics**: Click "Export" button (future feature)

---

## Troubleshooting

### Dashboard won't start

**Error**: `Address already in use`

**Solution**:
```bash
# Check what's using port 8765
$ lsof -i :8765

# Kill the process
$ kill <PID>

# Or use a different port
$ DASHBOARD_PORT=9000 claude-code-insideout --dashboard
```

---

### No metrics appearing

**Possible causes:**
1. Dashboard started but no queries made yet
   - **Solution**: Make a query, metrics should appear
   
2. Metrics collection not enabled
   - **Solution**: Restart Claude Code with `/dashboard` command

3. WebSocket connection failed
   - **Solution**: Check browser console for errors, refresh page

---

### Browser didn't open

**Solution**: Manually open the URL displayed in the terminal:
```
Dashboard is running at: http://localhost:8765
```

---

### High memory usage

**Cause**: Too many metrics stored in memory

**Solutions:**
1. Reduce retention period:
   ```bash
   export DASHBOARD_RETENTION_HOURS=6  # Default: 24
   ```

2. Limit history size:
   ```bash
   export DASHBOARD_MAX_HISTORY=500  # Default: 1000
   ```

3. Restart dashboard to clear old data

---

## Advanced Configuration

### Custom Port and Host

```bash
# Bind to all interfaces
DASHBOARD_HOST=0.0.0.0 DASHBOARD_PORT=8765 claude-code-insideout --dashboard

# Access from another machine
http://<your-ip>:8765
```

⚠️ **Security Warning**: Only bind to `0.0.0.0` on trusted networks! The dashboard has no authentication.

---

### Metrics Retention

```bash
# Keep metrics for 6 hours
export DASHBOARD_RETENTION_HOURS=6

# Keep only last 500 queries
export DASHBOARD_MAX_HISTORY=500
```

---

### Disable Auto-Open Browser

```bash
# Don't open browser automatically
DASHBOARD_NO_OPEN=1 claude-code-insideout --dashboard
```

---

## API Endpoints

For programmatic access, the dashboard exposes REST APIs:

### GET /api/metrics
Returns current aggregate metrics.

**Example:**
```bash
$ curl http://localhost:8765/api/metrics
{
  "totalQueries": 15,
  "totalAPIRequests": 42,
  "totalTokens": 125000,
  "totalCost": 1.247,
  "averageTTFT": 1234,
  "cacheHitRate": 0.87
}
```

### GET /api/history
Returns full metrics history.

**Example:**
```bash
$ curl http://localhost:8765/api/history > metrics.json
```

### GET /api/tools
Returns tool execution statistics.

**Example:**
```bash
$ curl http://localhost:8765/api/tools
[
  {
    "toolName": "Read",
    "count": 45,
    "averageDuration": 125,
    "successRate": 1.0
  },
  ...
]
```

---

## Tips and Best Practices

### 1. Leave Dashboard Open
Keep the dashboard open in a browser tab while working. It provides continuous visibility into your usage.

### 2. Monitor Costs
Check the total cost metric regularly to stay within budget.

### 3. Optimize Cache Usage
- Aim for 80%+ cache hit rate
- Structure prompts consistently
- Use cache controls on large, static content

### 4. Identify Slow Queries
- Watch TTFT for each query
- Investigate queries with TTFT > 5s
- Consider reducing context or simplifying system prompts

### 5. Tool Performance
- Monitor tool execution times
- Optimize or replace slow tools
- Fix tools with low success rates

### 6. Export Metrics
Save metrics for later analysis:
```bash
$ curl http://localhost:8765/api/history > metrics-$(date +%Y%m%d).json
```

---

## Future Enhancements

Planned features for future releases:

- 📊 **Export to CSV**: Download metrics for spreadsheet analysis
- 🔔 **Alerts**: Notify when cost exceeds threshold or errors occur
- 🔍 **Query Replay**: Step through a query's execution
- 📈 **Trends**: Historical analysis and comparisons
- 🗂️ **Persistence**: Save metrics to database
- 🔐 **Authentication**: Secure remote access
- 🎯 **Filtering**: Filter by date, model, tool, etc.
- 📱 **Mobile UI**: Responsive design for mobile devices

---

## Feedback

Found a bug or have a feature request? Please open an issue on GitHub!

Repository: https://github.com/brook2019/claude-code-insideout

---

## Summary

The Dashboard provides real-time visibility into:
- ✅ Query execution and performance
- ✅ Token usage and costs
- ✅ API latency (TTFT and total duration)
- ✅ Tool execution statistics
- ✅ Cache effectiveness

Use it to optimize performance, reduce costs, and debug issues effectively!
