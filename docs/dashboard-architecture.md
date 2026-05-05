# Real-time Monitoring Dashboard Architecture

## Overview

A web-based monitoring dashboard for visualizing Claude Code query execution in real-time, including API metrics, token usage, streaming performance, and tool execution statistics.

---

## Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                  Claude Code Client (Main Process)          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Query Execution (src/query.ts)                        │ │
│  │  API Client (src/services/api/claude.ts)              │ │
│  │  Tool Execution (src/tools/*)                         │ │
│  └──────────────┬─────────────────────────────────────────┘ │
│                 │ Emit metrics events                        │
│                 ↓                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Metrics Collector (src/services/dashboard/metrics.ts)│ │
│  │  - Aggregates metrics                                  │ │
│  │  - Stores time-series data                            │ │
│  │  - Broadcasts to WebSocket clients                    │ │
│  └──────────────┬─────────────────────────────────────────┘ │
└─────────────────┼─────────────────────────────────────────────┘
                  │
                  │ WebSocket broadcasts
                  ↓
┌─────────────────────────────────────────────────────────────┐
│         Web Server (src/services/dashboard/server.ts)       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Express/Fastify Server                                │ │
│  │  - Serves static HTML/JS                               │ │
│  │  - WebSocket endpoint for real-time updates           │ │
│  │  - REST API for historical data                       │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────┼─────────────────────────────────────────────┘
                  │
                  │ HTTP + WebSocket
                  ↓
┌─────────────────────────────────────────────────────────────┐
│              Dashboard UI (dashboard/ui/)                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  React App with Charts                                 │ │
│  │  - Real-time query timeline                            │ │
│  │  - Token usage graphs                                  │ │
│  │  - API latency metrics                                 │ │
│  │  - Tool execution stats                                │ │
│  │  - Cache performance                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Metric Collection Points

Hook into existing code to capture events:

#### API Metrics (src/services/api/claude.ts)
```typescript
// When API request starts
metrics.recordAPIRequest({
  requestId: string,
  model: string,
  timestamp: Date,
  messageCount: number,
  toolCount: number
})

// When stream starts (TTFT)
metrics.recordFirstToken({
  requestId: string,
  ttftMs: number
})

// When streaming content
metrics.recordStreamEvent({
  requestId: string,
  type: 'thinking' | 'text' | 'tool_use',
  deltaSize: number
})

// When request completes
metrics.recordAPIResponse({
  requestId: string,
  stopReason: string,
  usage: {
    inputTokens: number,
    outputTokens: number,
    cacheCreation: number,
    cacheRead: number
  },
  durationMs: number
})
```

#### Tool Execution (src/services/tools/)
```typescript
metrics.recordToolExecution({
  toolName: string,
  startTime: Date,
  endTime: Date,
  success: boolean,
  error?: string
})
```

#### Query Lifecycle (src/query.ts)
```typescript
metrics.recordQueryStart({
  queryId: string,
  source: QuerySource,
  timestamp: Date
})

metrics.recordQueryComplete({
  queryId: string,
  totalDuration: number,
  apiCalls: number,
  toolCalls: number
})
```

### 2. Metrics Storage

Time-series data structure:

```typescript
interface MetricsStore {
  queries: Array<{
    id: string
    startTime: Date
    endTime?: Date
    apiCalls: APICallMetric[]
    toolCalls: ToolCallMetric[]
    totalTokens: number
    totalCost: number
  }>
  
  apiCalls: Array<{
    requestId: string
    queryId: string
    model: string
    startTime: Date
    ttftMs: number
    totalDurationMs: number
    inputTokens: number
    outputTokens: number
    cacheHits: number
    stopReason: string
  }>
  
  toolCalls: Array<{
    toolName: string
    queryId: string
    startTime: Date
    durationMs: number
    success: boolean
    error?: string
  }>
  
  aggregates: {
    totalQueries: number
    totalTokens: number
    totalCost: number
    averageTTFT: number
    cacheHitRate: number
    toolSuccessRate: number
  }
}
```

### 3. WebSocket Protocol

Real-time updates from server to dashboard:

```typescript
// Event types
type DashboardEvent = 
  | { type: 'query:start', data: QueryStartData }
  | { type: 'query:end', data: QueryEndData }
  | { type: 'api:request', data: APIRequestData }
  | { type: 'api:response', data: APIResponseData }
  | { type: 'api:stream', data: StreamEventData }
  | { type: 'tool:start', data: ToolStartData }
  | { type: 'tool:end', data: ToolEndData }
  | { type: 'metrics:snapshot', data: AggregateMetrics }

// Client subscribes
ws.send({ type: 'subscribe', metrics: ['queries', 'api', 'tools'] })

// Server broadcasts
ws.broadcast({ type: 'api:response', data: {...} })
```

---

## Dashboard UI Components

### Main Layout

```
┌──────────────────────────────────────────────────────────┐
│  Claude Code Monitoring Dashboard                        │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │  Query Timeline (Live)                             │  │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  │
│  │  Query #1: [==API==][=Tools=][==API==]  ✓         │  │
│  │  Query #2: [====API====]... (in progress)         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────────────┐  ┌──────────────────────────┐  │
│  │  Token Usage         │  │  API Latency             │  │
│  │  ┌──────────────┐    │  │  ┌──────────────────┐   │  │
│  │  │  Line Chart  │    │  │  │  TTFT: 1.2s      │   │  │
│  │  │  Input: 8.5K │    │  │  │  Total: 5.4s     │   │  │
│  │  │  Output: 2K  │    │  │  │  ┌────────────┐  │   │  │
│  │  │  Cached: 90% │    │  │  │  │ Bar Chart  │  │   │  │
│  │  └──────────────┘    │  │  └──────────────────┘   │  │
│  └──────────────────────┘  └──────────────────────────┘  │
│                                                           │
│  ┌──────────────────────┐  ┌──────────────────────────┐  │
│  │  Tool Execution      │  │  Cache Performance       │  │
│  │  ┌──────────────┐    │  │  ┌──────────────────┐   │  │
│  │  │  Read: 45    │    │  │  │  Hit Rate: 92%   │   │  │
│  │  │  Edit: 12    │    │  │  │  Savings: $0.18  │   │  │
│  │  │  Bash: 8     │    │  │  │  ┌────────────┐  │   │  │
│  │  │  Avg: 150ms  │    │  │  │  │ Pie Chart  │  │   │  │
│  │  └──────────────┘    │  │  └──────────────────┘   │  │
│  └──────────────────────┘  └──────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Charts & Visualizations

1. **Query Timeline** (Gantt-style)
   - Each query as a horizontal bar
   - API calls vs Tool execution phases
   - Color-coded by status (success/error)

2. **Token Usage** (Line chart)
   - Input tokens over time
   - Output tokens over time
   - Cache hits overlay

3. **API Latency** (Bar + Box plot)
   - TTFT distribution
   - Total duration per request
   - Percentiles (p50, p95, p99)

4. **Tool Execution** (Bar chart + Table)
   - Count by tool type
   - Average duration
   - Success rate

5. **Cache Performance** (Pie + Line)
   - Cache hit vs miss ratio
   - Cost savings from caching
   - Cache effectiveness over time

6. **Live Metrics** (Number cards)
   - Active queries
   - Total API calls
   - Total tokens used
   - Current cost

---

## Technology Stack

### Backend
- **Server Framework**: Express or Fastify
- **WebSocket**: `ws` library (already in dependencies)
- **Metrics Storage**: In-memory with optional Redis for persistence
- **Port**: 8765 (configurable)

### Frontend
- **Framework**: React (already in dependencies)
- **Charts**: Chart.js or Recharts
- **WebSocket Client**: Native WebSocket API
- **Build**: Vite or esbuild
- **Styling**: Tailwind CSS or inline styles

### Integration
- **Launcher**: CLI flag `--dashboard` or `/dashboard` command
- **Auto-open**: Use `open` package to launch browser
- **Background**: Dashboard server runs alongside main process

---

## Implementation Plan

### Phase 1: Metrics Collection
1. Create `src/services/dashboard/metrics.ts`
2. Add event emitters in API client
3. Add event emitters in tool execution
4. Store metrics in-memory

### Phase 2: Web Server
1. Create `src/services/dashboard/server.ts`
2. Set up Express with WebSocket
3. Serve static HTML/JS
4. Implement REST endpoints for historical data

### Phase 3: Dashboard UI
1. Create `dashboard/ui/` directory
2. Build React app with charts
3. Implement WebSocket client
4. Add real-time updates

### Phase 4: Integration
1. Add CLI command in `src/commands.ts`
2. Auto-start server on CLI flag
3. Open browser automatically
4. Add graceful shutdown

### Phase 5: Documentation
1. Usage guide
2. Metrics reference
3. API documentation

---

## Configuration

```typescript
// .env or config
DASHBOARD_ENABLED=true
DASHBOARD_PORT=8765
DASHBOARD_HOST=localhost
DASHBOARD_AUTO_OPEN=true
DASHBOARD_RETENTION_HOURS=24  // Keep metrics for 24 hours
```

---

## Security Considerations

1. **Local-only**: Bind to localhost by default
2. **No authentication**: Assume local developer environment
3. **No sensitive data**: Don't log API keys or auth tokens
4. **CORS**: Restrict to localhost origins

---

## Performance Considerations

1. **Buffering**: Buffer metrics before broadcasting (100ms intervals)
2. **Pruning**: Auto-delete old metrics after retention period
3. **Sampling**: Sample high-frequency events if needed
4. **Memory limits**: Cap metrics storage (e.g., last 1000 queries)

---

## Future Enhancements

1. **Export metrics**: Save to JSON/CSV
2. **Persistence**: Optional Redis/SQLite for long-term storage
3. **Alerts**: Threshold-based notifications
4. **Comparison**: Compare queries side-by-side
5. **Replay**: Replay query execution step-by-step
6. **Remote access**: Optional authentication for remote monitoring

---

## Example Usage

```bash
# Start Claude Code with dashboard
$ claude-code-insideout --dashboard

# Or enable from within REPL
> /dashboard

# Dashboard opens at http://localhost:8765
# Watch real-time metrics as you query Claude
```

---

## Success Metrics

- ✅ See all queries in real-time
- ✅ Track token usage and costs
- ✅ Monitor API latency (TTFT, total duration)
- ✅ Visualize tool execution patterns
- ✅ Measure cache effectiveness
- ✅ Identify performance bottlenecks
- ✅ Debug slow queries

This dashboard will provide deep visibility into Claude Code's behavior, making it easier to optimize performance, debug issues, and understand usage patterns.
