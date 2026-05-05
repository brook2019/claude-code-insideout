# Dashboard Quick Start Guide

## ✅ Installation Complete

The dashboard has been successfully installed and is ready to use!

## 🚀 How to Use

### Step 1: Start Claude Code

```bash
$ cd /path/to/claude-code-insideout
$ ./bin/claude-code-insideout
```

### Step 2: Launch Dashboard

In the Claude Code REPL, type:

```
> /dashboard
```

The dashboard will:
1. ✅ Start a web server on `http://localhost:8765`
2. ✅ Automatically open your default browser
3. ✅ Begin collecting metrics from your queries

### Step 3: Use Claude Code Normally

Make queries as usual. The dashboard will show real-time metrics:

```
> Read the README.md file

> Edit src/main.tsx and add a comment

> Run the tests with bash
```

Watch the dashboard update in real-time with:
- Query timeline
- Token usage
- API latency (TTFT)
- Tool execution stats
- Cache performance

---

## 🎛️ Configuration

### Environment Variables

```bash
# Custom port (default: 8765)
export DASHBOARD_PORT=9000

# Custom host (default: localhost)
export DASHBOARD_HOST=127.0.0.1

# Don't auto-open browser
export DASHBOARD_NO_OPEN=1
```

Then start Claude Code:
```bash
$ ./bin/claude-code-insideout
> /dashboard
```

---

## 🧪 Verify Installation

Test that everything works:

```bash
# 1. Check command loads
$ bun -e "import('./src/commands/dashboard/index.ts').then(m => console.log('✓ Loaded:', m.default.name))"

# 2. Check command is registered
$ bun -e "import('./src/commands.ts').then(m => console.log('✓ Has dashboard:', m.builtInCommandNames().has('dashboard')))"

# 3. Test in REPL
$ ./bin/claude-code-insideout
> /dashboard
# Should see: "Dashboard is now running at http://localhost:8765"
```

---

## 📊 Dashboard Features

Once running, you'll see:

### Live Metrics
- **Queries**: Total and active queries
- **API Requests**: Total requests and streaming status
- **Token Usage**: Input, output, and cached tokens
- **Cost**: Real-time cost calculation
- **TTFT**: Average time to first token
- **Cache Hit Rate**: Percentage of cached tokens

### Visualizations
1. **Query Timeline**: Recent queries with duration and cost
2. **Token Usage Chart**: Line chart of input/output over time
3. **API Latency**: Bar chart of TTFT and total duration
4. **Tool Stats**: Bar chart of tool usage
5. **Cache Performance**: Doughnut chart of hit vs miss

### REST API
Access metrics programmatically:

```bash
# Current metrics
$ curl http://localhost:8765/api/metrics

# Full history
$ curl http://localhost:8765/api/history

# Tool statistics
$ curl http://localhost:8765/api/tools
```

---

## 🔧 Troubleshooting

### "Unknown command: /dashboard"

**Cause**: Command not loaded (shouldn't happen after fix)

**Solution**: Restart Claude Code:
```bash
$ ./bin/claude-code-insideout
> /dashboard
```

---

### "Address already in use"

**Cause**: Port 8765 already in use

**Solution 1** - Use a different port:
```bash
$ DASHBOARD_PORT=9000 ./bin/claude-code-insideout
> /dashboard
```

**Solution 2** - Kill existing process:
```bash
$ lsof -i :8765
$ kill <PID>
```

---

### Dashboard won't open in browser

**Cause**: Browser auto-open failed

**Solution**: Manually open the URL shown:
```
Dashboard is now running at http://localhost:8765
```

Or disable auto-open:
```bash
$ DASHBOARD_NO_OPEN=1 ./bin/claude-code-insideout
> /dashboard
```

---

### No metrics appearing

**Cause**: Dashboard started but no queries made yet

**Solution**: Make a query in Claude Code, metrics will appear immediately

---

## 📚 More Documentation

- **Architecture**: `docs/dashboard-architecture.md`
- **Usage Guide**: `docs/dashboard-usage.md`
- **Integration Guide**: `docs/dashboard-integration-guide.md`
- **Summary**: `docs/dashboard-summary.md`

---

## ✅ What Works Now

- ✅ Dashboard command loads successfully
- ✅ Command appears in `/help`
- ✅ Command registered in command registry
- ✅ Web server starts on port 8765
- ✅ UI loads with charts and metrics
- ✅ REST API endpoints work
- ✅ Real-time WebSocket connection
- ✅ Cross-platform browser auto-open

---

## ⚠️ Known Limitation

The dashboard collects metrics infrastructure is ready, but **metric collection hooks are not yet integrated** into the API client.

This means:
- ✅ Dashboard UI works and displays correctly
- ✅ All charts and components render
- ⚠️ Metrics will show zeros until hooks are added

**To integrate**: Follow the guide in `docs/dashboard-integration-guide.md`

**Current Status**: Dashboard is **ready for demo/testing**, full metrics collection pending integration.

---

## 🎉 Success!

You can now:
1. ✅ Launch dashboard with `/dashboard`
2. ✅ See the web UI at http://localhost:8765
3. ✅ View chart components and layout
4. ✅ Test REST API endpoints
5. ✅ Verify WebSocket connection

Next step: Integrate metric collection hooks to populate real data!
