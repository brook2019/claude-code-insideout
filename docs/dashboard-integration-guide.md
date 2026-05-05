# Dashboard Integration Guide

## Overview

This guide explains how to integrate metrics collection into the claude-code-insideout codebase.

---

## Integration Points

The dashboard metrics collection needs to hook into existing code at these key points:

### 1. API Client (src/services/api/claude.ts)

Add import at the top:
```typescript
import { 
  recordAPIRequestStart,
  recordFirstToken,
  recordStreamEvent,
  recordAPIRequestEnd,
  isDashboardEnabled
} from '../dashboard/integration.js'
```

#### Hook 1: API Request Start
**Location:** Around line 1950 (in the `queryModel` function, before making the API call)

```typescript
// Add after: const start = Date.now()
if (isDashboardEnabled()) {
  recordAPIRequestStart(
    streamRequestId,
    getCurrentQueryId(), // Need to pass query ID
    options.model,
    params.messages.length,
    params.tools?.length
  )
}
```

#### Hook 2: Time to First Token
**Location:** Around line 1988 (in message_start case)

```typescript
// Add after: ttftMs = Date.now() - start
if (isDashboardEnabled()) {
  recordFirstToken(part.message.id, ttftMs)
}
```

#### Hook 3: Stream Events
**Location:** Add after each logger.trace call for stream events

```typescript
// message_start
if (isDashboardEnabled()) {
  recordStreamEvent(part.message.id, 'message_start')
}

// content_block_start
if (isDashboardEnabled()) {
  recordStreamEvent(streamRequestId, 'content_block_start', part.content_block.type)
}

// content_block_delta
if (isDashboardEnabled()) {
  const deltaSize = delta.text?.length || delta.thinking?.length || 0
  recordStreamEvent(streamRequestId, 'content_block_delta', contentBlock.type, deltaSize)
}

// content_block_stop
if (isDashboardEnabled()) {
  recordStreamEvent(streamRequestId, 'content_block_stop', contentBlock?.type)
}

// message_delta
if (isDashboardEnabled()) {
  recordStreamEvent(streamRequestId, 'message_delta')
}

// message_stop
if (isDashboardEnabled()) {
  recordStreamEvent(streamRequestId, 'message_stop')
}
```

#### Hook 4: API Request Complete
**Location:** Around line 2200 (after stream finishes, before returning)

```typescript
// Add before: return {...}
if (isDashboardEnabled()) {
  recordAPIRequestEnd(
    streamRequestId,
    stopReason,
    {
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
      cacheCreationTokens: usage?.cache_creation_input_tokens || 0,
      cacheReadTokens: usage?.cache_read_input_tokens || 0
    }
  )
}
```

---

### 2. Query Lifecycle (src/query.ts)

Add import at the top:
```typescript
import { 
  recordQueryStart,
  recordQueryEnd,
  isDashboardEnabled
} from './services/dashboard/integration.js'
```

#### Hook 1: Query Start
**Location:** In the main query function (around line 100-200)

```typescript
// Add at the start of the query function
const queryId = randomUUID()
if (isDashboardEnabled()) {
  recordQueryStart(queryId, options.source || 'unknown')
}
```

#### Hook 2: Query End
**Location:** At the end of the query function (success case)

```typescript
// Add before returning
if (isDashboardEnabled()) {
  recordQueryEnd(queryId, 'completed')
}
```

#### Hook 3: Query Error
**Location:** In error catch blocks

```typescript
// In catch block
if (isDashboardEnabled()) {
  recordQueryEnd(queryId, 'error', errorMessage(error))
}
```

---

### 3. Tool Execution (src/services/tools/toolOrchestration.ts)

Add import:
```typescript
import { 
  recordToolExecutionStart,
  recordToolExecutionEnd,
  isDashboardEnabled
} from '../dashboard/integration.js'
```

#### Hook 1: Tool Start
**Location:** Before executing a tool

```typescript
// Add before tool execution
const toolId = `${tool.name}_${Date.now()}_${Math.random()}`
if (isDashboardEnabled()) {
  recordToolExecutionStart(toolId, tool.name, getCurrentQueryId())
}
```

#### Hook 2: Tool End
**Location:** After tool execution

```typescript
// Success case
if (isDashboardEnabled()) {
  recordToolExecutionEnd(toolId, true)
}

// Error case
if (isDashboardEnabled()) {
  recordToolExecutionEnd(toolId, false, errorMessage(error))
}
```

---

## Query ID Tracking

The dashboard needs to track query IDs across API calls and tool executions. Here's the recommended approach:

### Option 1: Context-Based (Preferred)
Use a context variable or AsyncLocalStorage to track the current query ID:

```typescript
// src/services/dashboard/queryContext.ts
import { AsyncLocalStorage } from 'node:async_hooks'

const queryContext = new AsyncLocalStorage<string>()

export function setCurrentQueryId(queryId: string): void {
  queryContext.enterWith(queryId)
}

export function getCurrentQueryId(): string | undefined {
  return queryContext.getStore()
}

export function runWithQueryId<T>(queryId: string, fn: () => T): T {
  return queryContext.run(queryId, fn)
}
```

Then in query.ts:
```typescript
import { runWithQueryId } from './services/dashboard/queryContext.js'

async function* query(...) {
  const queryId = randomUUID()
  return yield* runWithQueryId(queryId, async function* () {
    // All API calls and tool executions will have access to queryId
    // via getCurrentQueryId()
  })
}
```

### Option 2: Pass Through Options
Add queryId to options objects that are passed through the call chain:

```typescript
interface Options {
  // ... existing fields
  dashboardQueryId?: string
}
```

---

## Enabling/Disabling Dashboard

The dashboard metrics collection should be controlled by a flag:

```typescript
// In src/services/dashboard/integration.ts
import { isEnvTruthy } from '../../utils/envUtils.js'

let dashboardEnabled = false

export function enableDashboardMetrics(): void {
  dashboardEnabled = true
  logger.info('Dashboard', 'Dashboard metrics collection enabled')
}

export function disableDashboardMetrics(): void {
  dashboardEnabled = false
}

export function isDashboardEnabled(): boolean {
  return dashboardEnabled || isEnvTruthy(process.env.CLAUDE_CODE_DASHBOARD_ENABLED)
}
```

Then enable it when starting the dashboard server:

```typescript
// In CLI command handler
import { enableDashboardMetrics } from './services/dashboard/integration.js'
import { startDashboardServer } from './services/dashboard/server.js'

async function handleDashboardCommand() {
  enableDashboardMetrics()
  const server = await startDashboardServer({ port: 8765 })
  console.log(`Dashboard running at ${server.getURL()}`)
}
```

---

## Performance Considerations

### 1. Check Dashboard Enabled First
Always check if dashboard is enabled before collecting metrics:

```typescript
if (isDashboardEnabled()) {
  // Only do work if dashboard is active
  recordAPIRequestStart(...)
}
```

### 2. Don't Block Main Thread
Metrics collection should be fast and non-blocking:
- Use simple data structures (Maps, Arrays)
- Avoid expensive computations
- Don't perform I/O in the collection path

### 3. Buffering
Stream events are high-frequency. Consider buffering:

```typescript
let eventBuffer: StreamEventMetric[] = []

export function recordStreamEvent(...) {
  eventBuffer.push({...})
  
  if (eventBuffer.length >= 100) {
    flushEventBuffer()
  }
}

function flushEventBuffer() {
  const collector = getMetricsCollector()
  for (const event of eventBuffer) {
    collector.recordStreamEvent(event)
  }
  eventBuffer = []
}

// Flush periodically
setInterval(flushEventBuffer, 100) // Every 100ms
```

---

## Testing

### 1. Unit Tests
Test metrics collection in isolation:

```typescript
import { getMetricsCollector } from './services/dashboard/metrics.js'

test('records API request metrics', () => {
  const collector = getMetricsCollector()
  collector.recordAPIStart({
    requestId: 'req_123',
    queryId: 'query_456',
    model: 'claude-sonnet-4.5',
    timestamp: new Date()
  })
  
  const history = collector.getHistory()
  expect(history.apiCalls).toHaveLength(1)
  expect(history.apiCalls[0].requestId).toBe('req_123')
})
```

### 2. Integration Tests
Test that hooks are called correctly:

```typescript
import { enableDashboardMetrics } from './services/dashboard/integration.js'
import { getMetricsCollector } from './services/dashboard/metrics.js'

test('API client records metrics', async () => {
  enableDashboardMetrics()
  const collector = getMetricsCollector()
  
  // Make an API call
  await queryModel(...)
  
  // Verify metrics were recorded
  const metrics = collector.getAggregateMetrics()
  expect(metrics.totalAPIRequests).toBeGreaterThan(0)
})
```

### 3. Manual Testing
Start the dashboard and verify metrics appear:

```bash
$ claude-code-insideout --dashboard
Dashboard running at http://localhost:8765

# In another terminal
$ claude-code-insideout -p "Say hello"

# Check dashboard shows the query, API call, and metrics
```

---

## Troubleshooting

### Metrics Not Appearing
1. Check that dashboard is enabled: `isDashboardEnabled()` should return `true`
2. Verify WebSocket connection is open (check browser console)
3. Check that integration hooks are being called (add debug logging)
4. Verify metrics collector is initialized

### High Memory Usage
1. Check metrics retention settings
2. Verify old data is being pruned
3. Reduce stream event buffering if needed
4. Consider sampling high-frequency events

### Performance Impact
1. Verify `isDashboardEnabled()` checks are in place
2. Check that metrics collection is fast (<1ms per call)
3. Profile the application with dashboard enabled vs disabled
4. Consider disabling stream event recording for production use

---

## Future Enhancements

1. **Persistent Storage**: Save metrics to SQLite or Redis
2. **Remote Access**: Add authentication for remote monitoring
3. **Alerts**: Threshold-based notifications
4. **Export**: Save metrics to JSON/CSV files
5. **Comparison**: Compare queries side-by-side
6. **Replay**: Step-by-step query replay
7. **Profiling**: CPU and memory profiling integration
8. **Distributed Tracing**: OpenTelemetry integration

---

## Summary

The dashboard integration requires:

1. ✅ Import integration functions at key locations
2. ✅ Add hooks after existing logger calls
3. ✅ Implement query ID tracking (AsyncLocalStorage recommended)
4. ✅ Check `isDashboardEnabled()` before recording metrics
5. ✅ Test thoroughly to ensure minimal performance impact

Once integrated, the dashboard will provide real-time visibility into Claude Code's behavior without impacting normal operation when disabled.
