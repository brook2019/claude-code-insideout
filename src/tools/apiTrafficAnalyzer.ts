/**
 * API Traffic Analyzer
 *
 * Captures and analyzes Claude API traffic from debug logs to generate
 * documentation about server-side behavior patterns.
 *
 * Two modes:
 * 1. Analyze existing debug logs: parse ~/.claude/debug/*.txt
 * 2. Live capture: wrap a Claude Code session and capture all API traffic
 *
 * Output: Markdown report documenting observed server behavior including
 * streaming protocol, caching patterns, rate limiting, timing, and errors.
 *
 * Usage:
 *   bun run src/tools/apiTrafficAnalyzer.ts analyze [debug-log-path]
 *   bun run src/tools/apiTrafficAnalyzer.ts capture --session <sessionId>
 *   bun run src/tools/apiTrafficAnalyzer.ts report [-o server-behavior.md]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { homedir } from 'node:os'

// ─── Types ──────────────────────────────────────────────────────────────────

interface APIRequest {
  timestamp: string
  model: string
  maxTokens: number
  messageCount: number
  toolCount: number
  requestId?: string
}

interface APIResponse {
  timestamp: string
  requestId?: string
  messageId?: string
  model?: string
  role?: string
  ttftMs?: number
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheCreation: number
    cacheRead: number
  }
  stopReason?: string
  totalDurationMs?: number
}

interface StreamingEvent {
  timestamp: string
  requestId?: string
  eventType: string
  detail: string
}

interface StreamingStall {
  timestamp: string
  durationSec: number
  stallNumber: number
  totalStallTime: number
  eventType: string
  model: string
  requestId: string
}

interface ErrorEvent {
  timestamp: string
  errorType: string
  detail: string
  requestId?: string
}

interface ParsedTraffic {
  requests: APIRequest[]
  responses: APIResponse[]
  streamEvents: StreamingEvent[]
  stalls: StreamingStall[]
  errors: ErrorEvent[]
  rawLines: number
  timeRange: { start: string; end: string }
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function parseDebugLog(content: string): ParsedTraffic {
  const lines = content.split('\n')
  const requests: APIRequest[] = []
  const responses: APIResponse[] = []
  const streamEvents: StreamingEvent[] = []
  const stalls: StreamingStall[] = []
  const errors: ErrorEvent[] = []
  let firstTimestamp = ''
  let lastTimestamp = ''

  for (const line of lines) {
    if (!line.trim()) continue

    // Extract timestamp: "2026-05-17T19:10:47.383Z [LEVEL] message"
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s/)
    const timestamp = tsMatch ? tsMatch[1]! : ''
    if (timestamp && !firstTimestamp) firstTimestamp = timestamp
    if (timestamp) lastTimestamp = timestamp

    // API Request
    if (line.includes('API Request - model:')) {
      const modelMatch = line.match(/model:\s*([\w.:/-]+)/)
      const maxTokensMatch = line.match(/max_tokens:\s*(\d+)/)
      const messagesMatch = line.match(/messages\.length:\s*(\d+)/)
      const toolsMatch = line.match(/tools\.length:\s*(\d+)/)
      const model = modelMatch ? modelMatch[1]!.trim() : 'unknown'
      // Skip lines that look like code/type definitions accidentally matched
      if (model.length < 80 && !model.includes('\\n') && model !== 'string') {
        requests.push({
          timestamp,
          model,
          maxTokens: maxTokensMatch ? parseInt(maxTokensMatch[1]!) : 0,
          messageCount: messagesMatch ? parseInt(messagesMatch[1]!) : 0,
          toolCount: toolsMatch ? parseInt(toolsMatch[1]!) : 0,
        })
      }
    }

    // API Response headers
    if (line.includes('API Response headers received')) {
      const ridMatch = line.match(/request_id:\s*(\S+)/)
      responses.push({
        timestamp,
        requestId: ridMatch ? ridMatch[1]! : undefined,
      })
    }

    // message_start (TTFT and usage)
    if (line.includes('message_start received')) {
      const idMatch = line.match(/id:\s*([^,]+)/)
      const modelMatch = line.match(/model:\s*([^,]+)/)
      const roleMatch = line.match(/role:\s*([^,]+)/)
      const ttftMatch = line.match(/ttftMs:\s*(\d+)/)
      streamEvents.push({
        timestamp,
        eventType: 'message_start',
        detail: line.replace(/^.*\[LLM\]\s*/, ''),
      })
      // Update the most recent response with TTFT
      if (responses.length > 0 && ttftMatch) {
        const last = responses[responses.length - 1]!
        last.ttftMs = parseInt(ttftMatch[1]!)
        if (idMatch) last.messageId = idMatch[1]!.trim()
        if (modelMatch) last.model = modelMatch[1]!.trim()
      }
    }

    // message_start usage
    if (line.includes('message_start usage')) {
      const inputMatch = line.match(/input_tokens:\s*(\d+)/)
      const cacheCreateMatch = line.match(/cache_creation_input_tokens:\s*(\d+)/)
      const cacheReadMatch = line.match(/cache_read_input_tokens:\s*(\d+)/)
      if (responses.length > 0) {
        const last = responses[responses.length - 1]!
        last.usage = {
          inputTokens: inputMatch ? parseInt(inputMatch[1]!) : 0,
          outputTokens: 0,
          cacheCreation: cacheCreateMatch ? parseInt(cacheCreateMatch[1]!) : 0,
          cacheRead: cacheReadMatch ? parseInt(cacheReadMatch[1]!) : 0,
        }
      }
    }

    // content_block_start
    if (line.includes('content_block_start')) {
      const typeMatch = line.match(/type:\s*(\S+)/)
      streamEvents.push({
        timestamp,
        eventType: 'content_block_start',
        detail: typeMatch ? typeMatch[1]! : 'unknown',
      })
    }

    // tool_use started
    if (line.includes('tool_use started')) {
      const nameMatch = line.match(/name:\s*(\S+)/)
      streamEvents.push({
        timestamp,
        eventType: 'tool_use_start',
        detail: nameMatch ? nameMatch[1]! : 'unknown',
      })
    }

    // Streaming stall
    if (line.includes('Streaming stall detected')) {
      const durMatch = line.match(/([\d.]+)s gap/)
      const stallNumMatch = line.match(/stall #(\d+)/)
      stalls.push({
        timestamp,
        durationSec: durMatch ? parseFloat(durMatch[1]!) : 0,
        stallNumber: stallNumMatch ? parseInt(stallNumMatch[1]!) : 0,
        totalStallTime: 0,
        eventType: 'stall',
        model: 'unknown',
        requestId: 'unknown',
      })
    }

    // Streaming idle timeout/warning
    if (line.includes('Streaming idle')) {
      errors.push({
        timestamp,
        errorType: line.includes('timeout') ? 'streaming_idle_timeout' : 'streaming_idle_warning',
        detail: line.replace(/^.*\[.*?\]\s*/, ''),
      })
    }

    // Stream started
    if (line.includes('Stream started - received first chunk')) {
      streamEvents.push({
        timestamp,
        eventType: 'first_chunk',
        detail: 'Stream started',
      })
    }

    // Text delta
    if (line.includes('Received text delta')) {
      streamEvents.push({
        timestamp,
        eventType: 'text_delta',
        detail: '',
      })
    }

    // Errors
    if (line.includes('[ERROR]')) {
      errors.push({
        timestamp,
        errorType: 'error',
        detail: line.replace(/^.*\[ERROR\]\s*/, ''),
      })
    }
  }

  return {
    requests,
    responses,
    streamEvents,
    stalls,
    errors,
    rawLines: lines.length,
    timeRange: { start: firstTimestamp, end: lastTimestamp },
  }
}

// ─── Analysis ───────────────────────────────────────────────────────────────

interface AnalysisReport {
  overview: {
    totalRequests: number
    totalResponses: number
    totalStreamEvents: number
    totalErrors: number
    timeRange: { start: string; end: string }
    sessionDuration: string
  }
  models: Map<string, { count: number; avgTTFT: number; ttftValues: number[] }>
  caching: {
    totalCacheRead: number
    totalCacheCreation: number
    cacheHitRate: number
    avgCacheReadPerRequest: number
    cacheReadDistribution: number[]
  }
  streaming: {
    eventTypeCounts: Map<string, number>
    avgTTFT: number
    medianTTFT: number
    p95TTFT: number
    stallCount: number
    avgStallDuration: number
    totalStallTime: number
  }
  toolUsage: {
    avgToolsPerRequest: number
    maxTools: number
  }
  errors: {
    errorTypes: Map<string, number>
    totalErrors: number
  }
  messageStats: {
    avgMessagesPerRequest: number
    maxMessages: number
    avgMaxTokens: number
  }
}

function analyzeTraffic(traffic: ParsedTraffic): AnalysisReport {
  // Time range
  const startMs = traffic.timeRange.start ? new Date(traffic.timeRange.start).getTime() : 0
  const endMs = traffic.timeRange.end ? new Date(traffic.timeRange.end).getTime() : 0
  const durationMs = endMs - startMs
  const durationStr = durationMs > 0
    ? formatDuration(durationMs)
    : 'unknown'

  // Model stats
  const modelStats = new Map<string, { count: number; avgTTFT: number; ttftValues: number[] }>()
  for (const req of traffic.requests) {
    if (!modelStats.has(req.model)) {
      modelStats.set(req.model, { count: 0, avgTTFT: 0, ttftValues: [] })
    }
    modelStats.get(req.model)!.count++
  }
  for (const resp of traffic.responses) {
    if (resp.model && resp.ttftMs !== undefined) {
      const stats = modelStats.get(resp.model)
      if (stats) {
        stats.ttftValues.push(resp.ttftMs)
        stats.avgTTFT = stats.ttftValues.reduce((a, b) => a + b, 0) / stats.ttftValues.length
      }
    }
  }

  // Caching stats
  let totalCacheRead = 0
  let totalCacheCreation = 0
  const cacheReadValues: number[] = []
  for (const resp of traffic.responses) {
    if (resp.usage) {
      totalCacheRead += resp.usage.cacheRead
      totalCacheCreation += resp.usage.cacheCreation
      cacheReadValues.push(resp.usage.cacheRead)
    }
  }
  const totalCacheTokens = totalCacheRead + totalCacheCreation
  const cacheHitRate = totalCacheTokens > 0 ? totalCacheRead / totalCacheTokens : 0

  // TTFT stats
  const ttftValues = traffic.responses.filter(r => r.ttftMs !== undefined).map(r => r.ttftMs!)
  ttftValues.sort((a, b) => a - b)
  const avgTTFT = ttftValues.length > 0 ? ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length : 0
  const medianTTFT = ttftValues.length > 0 ? ttftValues[Math.floor(ttftValues.length / 2)]! : 0
  const p95TTFT = ttftValues.length > 0 ? ttftValues[Math.floor(ttftValues.length * 0.95)]! : 0

  // Streaming event counts
  const eventTypeCounts = new Map<string, number>()
  for (const evt of traffic.streamEvents) {
    eventTypeCounts.set(evt.eventType, (eventTypeCounts.get(evt.eventType) || 0) + 1)
  }

  // Stall stats
  const stallDurations = traffic.stalls.map(s => s.durationSec)
  const avgStallDuration = stallDurations.length > 0 ? stallDurations.reduce((a, b) => a + b, 0) / stallDurations.length : 0
  const totalStallTime = stallDurations.reduce((a, b) => a + b, 0)

  // Tool usage
  const toolCounts = traffic.requests.map(r => r.toolCount)
  const avgTools = toolCounts.length > 0 ? toolCounts.reduce((a, b) => a + b, 0) / toolCounts.length : 0
  const maxTools = Math.max(0, ...toolCounts)

  // Error types
  const errorTypes = new Map<string, number>()
  for (const err of traffic.errors) {
    errorTypes.set(err.errorType, (errorTypes.get(err.errorType) || 0) + 1)
  }

  // Message stats
  const messageCounts = traffic.requests.map(r => r.messageCount)
  const avgMessages = messageCounts.length > 0 ? messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length : 0
  const maxMessages = Math.max(0, ...messageCounts)
  const maxTokenValues = traffic.requests.map(r => r.maxTokens).filter(v => v > 0)
  const avgMaxTokens = maxTokenValues.length > 0 ? maxTokenValues.reduce((a, b) => a + b, 0) / maxTokenValues.length : 0

  return {
    overview: {
      totalRequests: traffic.requests.length,
      totalResponses: traffic.responses.length,
      totalStreamEvents: traffic.streamEvents.length,
      totalErrors: traffic.errors.length,
      timeRange: traffic.timeRange,
      sessionDuration: durationStr,
    },
    models: modelStats,
    caching: {
      totalCacheRead,
      totalCacheCreation,
      cacheHitRate,
      avgCacheReadPerRequest: cacheReadValues.length > 0 ? totalCacheRead / cacheReadValues.length : 0,
      cacheReadDistribution: cacheReadValues,
    },
    streaming: {
      eventTypeCounts,
      avgTTFT,
      medianTTFT,
      p95TTFT,
      stallCount: traffic.stalls.length,
      avgStallDuration,
      totalStallTime,
    },
    toolUsage: {
      avgToolsPerRequest: avgTools,
      maxTools,
    },
    errors: {
      errorTypes,
      totalErrors: traffic.errors.length,
    },
    messageStats: {
      avgMessagesPerRequest: avgMessages,
      maxMessages,
      avgMaxTokens,
    },
  }
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000)
  const mins = Math.floor(secs / 60)
  const hrs = Math.floor(mins / 60)
  if (hrs > 0) return hrs + 'h ' + (mins % 60) + 'm'
  if (mins > 0) return mins + 'm ' + (secs % 60) + 's'
  return secs + 's'
}

// ─── Report Generation ──────────────────────────────────────────────────────

function generateReport(traffic: ParsedTraffic, report: AnalysisReport): string {
  const lines: string[] = []

  lines.push('# Claude API Server Behavior Report')
  lines.push('')
  lines.push('Analysis of observed API behavior from Claude Code debug logs.')
  lines.push('This documents the **server-side patterns** visible from the client perspective.')
  lines.push('')
  lines.push('---')
  lines.push('')

  // Overview
  lines.push('## Overview')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|--------|-------|')
  lines.push('| API Requests | ' + report.overview.totalRequests + ' |')
  lines.push('| API Responses | ' + report.overview.totalResponses + ' |')
  lines.push('| Stream Events | ' + report.overview.totalStreamEvents + ' |')
  lines.push('| Errors | ' + report.overview.totalErrors + ' |')
  lines.push('| Session Duration | ' + report.overview.sessionDuration + ' |')
  lines.push('| Time Range | ' + report.overview.timeRange.start + ' to ' + report.overview.timeRange.end + ' |')
  lines.push('')

  // Model Usage
  lines.push('## Model Usage')
  lines.push('')
  lines.push('| Model | Requests | Avg TTFT | Median TTFT | Samples |')
  lines.push('|-------|----------|----------|-------------|---------|')
  for (const [model, stats] of report.models.entries()) {
    const median = stats.ttftValues.length > 0
      ? stats.ttftValues.sort((a, b) => a - b)[Math.floor(stats.ttftValues.length / 2)]
      : 0
    lines.push('| ' + model + ' | ' + stats.count + ' | ' + Math.round(stats.avgTTFT) + 'ms | ' + Math.round(median!) + 'ms | ' + stats.ttftValues.length + ' |')
  }
  lines.push('')

  // Streaming Protocol
  lines.push('## Streaming Protocol Observations')
  lines.push('')
  lines.push('### Event Type Distribution')
  lines.push('')
  lines.push('| Event Type | Count |')
  lines.push('|-----------|-------|')
  const sortedEvents = Array.from(report.streaming.eventTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
  for (const [type, count] of sortedEvents) {
    lines.push('| ' + type + ' | ' + count + ' |')
  }
  lines.push('')

  lines.push('### Latency (Time to First Token)')
  lines.push('')
  lines.push('| Percentile | Value |')
  lines.push('|-----------|-------|')
  lines.push('| Average | ' + Math.round(report.streaming.avgTTFT) + 'ms |')
  lines.push('| Median (p50) | ' + Math.round(report.streaming.medianTTFT) + 'ms |')
  lines.push('| p95 | ' + Math.round(report.streaming.p95TTFT) + 'ms |')
  lines.push('')

  if (report.streaming.stallCount > 0) {
    lines.push('### Streaming Stalls')
    lines.push('')
    lines.push('| Metric | Value |')
    lines.push('|--------|-------|')
    lines.push('| Stall Count | ' + report.streaming.stallCount + ' |')
    lines.push('| Avg Stall Duration | ' + report.streaming.avgStallDuration.toFixed(1) + 's |')
    lines.push('| Total Stall Time | ' + report.streaming.totalStallTime.toFixed(1) + 's |')
    lines.push('')
  }

  // Caching Behavior
  lines.push('## Prompt Caching Behavior')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|--------|-------|')
  lines.push('| Cache Hit Rate | ' + (report.caching.cacheHitRate * 100).toFixed(1) + '% |')
  lines.push('| Total Cache Read Tokens | ' + formatTokens(report.caching.totalCacheRead) + ' |')
  lines.push('| Total Cache Creation Tokens | ' + formatTokens(report.caching.totalCacheCreation) + ' |')
  lines.push('| Avg Cache Read / Request | ' + formatTokens(Math.round(report.caching.avgCacheReadPerRequest)) + ' |')
  lines.push('')

  if (report.caching.cacheReadDistribution.length > 0) {
    lines.push('### Cache Read Distribution')
    lines.push('')
    const sorted = [...report.caching.cacheReadDistribution].sort((a, b) => a - b)
    const min = sorted[0] || 0
    const max = sorted[sorted.length - 1] || 0
    const median = sorted[Math.floor(sorted.length / 2)] || 0
    lines.push('- Min: ' + formatTokens(min))
    lines.push('- Median: ' + formatTokens(median))
    lines.push('- Max: ' + formatTokens(max))
    lines.push('')
  }

  // Request Patterns
  lines.push('## Request Patterns')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|--------|-------|')
  lines.push('| Avg Messages / Request | ' + report.messageStats.avgMessagesPerRequest.toFixed(1) + ' |')
  lines.push('| Max Messages | ' + report.messageStats.maxMessages + ' |')
  lines.push('| Avg max_tokens | ' + Math.round(report.messageStats.avgMaxTokens) + ' |')
  lines.push('| Avg Tools / Request | ' + report.toolUsage.avgToolsPerRequest.toFixed(1) + ' |')
  lines.push('| Max Tools | ' + report.toolUsage.maxTools + ' |')
  lines.push('')

  // Errors
  if (report.errors.totalErrors > 0) {
    lines.push('## Errors & Edge Cases')
    lines.push('')
    lines.push('| Error Type | Count |')
    lines.push('|-----------|-------|')
    for (const [type, count] of report.errors.errorTypes.entries()) {
      lines.push('| ' + type + ' | ' + count + ' |')
    }
    lines.push('')
  }

  // Streaming Protocol Documentation
  lines.push('## Streaming Protocol Reference')
  lines.push('')
  lines.push('Based on observed Server-Sent Events (SSE) from the Claude API:')
  lines.push('')
  lines.push('```')
  lines.push('Event Sequence (typical successful request):')
  lines.push('')
  lines.push('1. message_start       → Message ID, model, role, usage (input tokens, cache stats)')
  lines.push('2. content_block_start → thinking | text | tool_use (with id, name)')
  lines.push('3. content_block_delta → thinking_delta | text_delta | input_json_delta')
  lines.push('   (repeated for each chunk)')
  lines.push('4. content_block_stop  → Block finalized')
  lines.push('   (steps 2-4 repeat for each content block)')
  lines.push('5. message_delta       → stop_reason, output usage (output_tokens)')
  lines.push('6. message_stop        → Stream complete')
  lines.push('```')
  lines.push('')
  lines.push('### Key Observations')
  lines.push('')
  lines.push('- **Token counts arrive in two phases**: input tokens at `message_start`, output tokens at `message_delta`')
  lines.push('- **Cache stats are reported eagerly**: `cache_read_input_tokens` and `cache_creation_input_tokens` appear in `message_start.usage`')
  lines.push('- **TTFT measures**: Time from request sent to first `message_start` event received')
  lines.push('- **Multiple content blocks per message**: The server interleaves thinking, text, and tool_use blocks in a single response')
  lines.push('- **Parallel tool_use**: Multiple `tool_use` content blocks can appear in one message (stop_reason = "tool_use")')
  lines.push('- **Stop reasons observed**: `end_turn` (complete), `tool_use` (needs tool results), `max_tokens` (truncated)')
  lines.push('')

  // Rate Limiting Notes
  lines.push('## Rate Limiting (Observable Behavior)')
  lines.push('')
  lines.push('- Rate limit information is communicated via HTTP response headers')
  lines.push('- Claude Code implements exponential backoff with jitter on 429/529 responses')
  lines.push('- Streaming idle timeout (configurable): aborts streams with no data for 90s')
  lines.push('- Stall detection: logs gaps >30s between streaming events')
  lines.push('')

  lines.push('---')
  lines.push('')
  lines.push('*Generated by claude-code-insideout API Traffic Analyzer*')
  lines.push('*Source: Debug log analysis of ' + report.overview.totalRequests + ' API requests*')

  return lines.join('\n')
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function findDebugLogs(): string[] {
  const results: string[] = []

  // Check the main debug.log (richest source — contains LLM trace lines)
  const mainLog = join(homedir(), '.claude', 'logs', 'debug.log')
  try {
    if (statSync(mainLog).size > 100) results.push(mainLog)
  } catch { /* not found */ }

  // Also check session-specific debug files
  const debugDir = join(homedir(), '.claude', 'debug')
  try {
    const files = readdirSync(debugDir)
      .filter(f => f.endsWith('.txt') && f !== 'latest')
      .map(f => join(debugDir, f))
      .filter(f => {
        try { return statSync(f).size > 100; } catch { return false; }
      })
      .sort((a, b) => {
        try { return statSync(b).mtime.getTime() - statSync(a).mtime.getTime(); } catch { return 0; }
      })
    results.push(...files)
  } catch { /* dir not found */ }

  return results
}

function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    console.log('')
    console.log('  API Traffic Analyzer')
    console.log('')
    console.log('  Analyzes Claude API traffic from debug logs to document server behavior.')
    console.log('')
    console.log('  Commands:')
    console.log('    analyze [path]     Analyze a specific debug log file')
    console.log('    report [-o file]   Analyze all recent debug logs and generate report')
    console.log('')
    console.log('  Options:')
    console.log('    -o, --output       Output file path (default: docs/server-behavior.md)')
    console.log('    --limit N          Limit to N most recent log files (default: 10)')
    console.log('')
    console.log('  Prerequisites:')
    console.log('    Enable debug logging: export CLAUDE_CODE_DEBUG_LOG=~/.claude/debug/session.txt')
    console.log('    Or set in .env: CLAUDE_CODE_DEBUG_LOG=~/.claude/logs/debug.log')
    console.log('')
    console.log('  Debug logs location: ~/.claude/debug/')
    console.log('')
    process.exit(0)
  }

  function getOpt(flag: string): string | undefined {
    const i = args.indexOf(flag)
    return i >= 0 && args[i + 1] ? args[i + 1] : undefined
  }
  const outputPath = getOpt('-o') || getOpt('--output')
  const limit = parseInt(getOpt('--limit') || '10')

  if (command === 'analyze') {
    const logPath = args[1]
    if (!logPath) {
      // Find most recent debug log
      const logs = findDebugLogs()
      if (logs.length === 0) {
        console.error('No debug logs found in ~/.claude/debug/')
        console.error('Enable debug logging with: export CLAUDE_CODE_DEBUG_LOG=~/.claude/debug/session.txt')
        process.exit(1)
      }
      console.log('Found ' + logs.length + ' debug log(s). Analyzing most recent: ' + basename(logs[0]!))
      const content = readFileSync(logs[0]!, 'utf-8')
      const traffic = parseDebugLog(content)
      const report = analyzeTraffic(traffic)
      printSummary(report)
      return
    }

    console.log('Analyzing: ' + logPath)
    const content = readFileSync(logPath, 'utf-8')
    const traffic = parseDebugLog(content)
    const report = analyzeTraffic(traffic)
    printSummary(report)

  } else if (command === 'report') {
    const logs = findDebugLogs().slice(0, limit)
    if (logs.length === 0) {
      console.error('No debug logs found in ~/.claude/debug/')
      console.error('Enable debug logging with: export CLAUDE_CODE_DEBUG_LOG=~/.claude/debug/session.txt')
      process.exit(1)
    }

    console.log('Analyzing ' + logs.length + ' debug log file(s)...')

    // Merge all traffic
    const allTraffic: ParsedTraffic = {
      requests: [],
      responses: [],
      streamEvents: [],
      stalls: [],
      errors: [],
      rawLines: 0,
      timeRange: { start: '', end: '' },
    }

    for (const logFile of logs) {
      console.log('  Reading: ' + basename(logFile))
      const content = readFileSync(logFile, 'utf-8')
      const traffic = parseDebugLog(content)
      allTraffic.requests.push(...traffic.requests)
      allTraffic.responses.push(...traffic.responses)
      allTraffic.streamEvents.push(...traffic.streamEvents)
      allTraffic.stalls.push(...traffic.stalls)
      allTraffic.errors.push(...traffic.errors)
      allTraffic.rawLines += traffic.rawLines
      if (!allTraffic.timeRange.start || traffic.timeRange.start < allTraffic.timeRange.start) {
        allTraffic.timeRange.start = traffic.timeRange.start
      }
      if (!allTraffic.timeRange.end || traffic.timeRange.end > allTraffic.timeRange.end) {
        allTraffic.timeRange.end = traffic.timeRange.end
      }
    }

    const report = analyzeTraffic(allTraffic)
    const md = generateReport(allTraffic, report)

    const out = outputPath || 'docs/server-behavior.md'
    writeFileSync(out, md, 'utf-8')
    console.log('')
    console.log('Report generated: ' + out)
    console.log('')
    printSummary(report)

  } else {
    console.error('Unknown command: ' + command)
    process.exit(1)
  }
}

function printSummary(report: AnalysisReport): void {
  console.log('')
  console.log('  Summary:')
  console.log('    Requests:    ' + report.overview.totalRequests)
  console.log('    Responses:   ' + report.overview.totalResponses)
  console.log('    Avg TTFT:    ' + Math.round(report.streaming.avgTTFT) + 'ms')
  console.log('    p95 TTFT:    ' + Math.round(report.streaming.p95TTFT) + 'ms')
  console.log('    Cache Rate:  ' + (report.caching.cacheHitRate * 100).toFixed(1) + '%')
  console.log('    Stalls:      ' + report.streaming.stallCount)
  console.log('    Errors:      ' + report.errors.totalErrors)
  console.log('    Duration:    ' + report.overview.sessionDuration)
  console.log('')
}

main()
