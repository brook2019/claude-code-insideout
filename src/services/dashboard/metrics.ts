/**
 * Metrics collection service for the monitoring dashboard
 * Collects and aggregates metrics from API calls, tool executions, and queries
 */

import { EventEmitter } from 'node:events'
import type {
  QueryMetric,
  APICallMetric,
  ToolCallMetric,
  StreamEventMetric,
  AggregateMetrics,
  ToolStats,
  DashboardEvent,
  MetricsHistory,
} from './types.js'

export class MetricsCollector extends EventEmitter {
  private queries: Map<string, QueryMetric> = new Map()
  private apiCalls: Map<string, APICallMetric> = new Map()
  private toolCalls: Map<string, ToolCallMetric> = new Map()
  private streamEvents: StreamEventMetric[] = []

  private maxHistorySize: number = 1000
  private retentionHours: number = 24

  constructor(options?: { maxHistorySize?: number; retentionHours?: number }) {
    super()
    if (options?.maxHistorySize) {
      this.maxHistorySize = options.maxHistorySize
    }
    if (options?.retentionHours) {
      this.retentionHours = options.retentionHours
    }

    // Prune old data every hour
    setInterval(() => this.pruneOldData(), 60 * 60 * 1000)
  }

  // Query lifecycle
  recordQueryStart(data: {
    queryId: string
    source: string
    timestamp?: Date
  }): void {
    const query: QueryMetric = {
      id: data.queryId,
      startTime: data.timestamp || new Date(),
      source: data.source,
      apiCalls: [],
      toolCalls: [],
      totalTokens: 0,
      totalCost: 0,
      status: 'in_progress',
    }

    this.queries.set(query.id, query)
    this.emit('event', { type: 'query:start', data: query } as DashboardEvent)
  }

  recordQueryEnd(data: {
    queryId: string
    timestamp?: Date
    status?: 'completed' | 'error'
    error?: string
  }): void {
    const query = this.queries.get(data.queryId)
    if (!query) return

    query.endTime = data.timestamp || new Date()
    query.status = data.status || 'completed'
    query.error = data.error

    // Calculate totals from API calls
    let totalTokens = 0
    let totalCost = 0
    for (const apiCallId of query.apiCalls) {
      const apiCall = this.apiCalls.get(apiCallId)
      if (apiCall) {
        const inputTokens = apiCall.inputTokens || 0
        const outputTokens = apiCall.outputTokens || 0
        const cacheRead = apiCall.cacheReadTokens || 0
        const cacheCreation = apiCall.cacheCreationTokens || 0

        totalTokens += inputTokens + outputTokens

        // Cost calculation (approximate)
        // Input: $0.003/1K, Output: $0.015/1K
        // Cache read: $0.0003/1K, Cache creation: $0.00375/1K
        totalCost += (inputTokens * 0.003) / 1000
        totalCost += (outputTokens * 0.015) / 1000
        totalCost += (cacheRead * 0.0003) / 1000
        totalCost += (cacheCreation * 0.00375) / 1000
      }
    }

    query.totalTokens = totalTokens
    query.totalCost = totalCost

    this.emit('event', { type: 'query:end', data: query } as DashboardEvent)
  }

  // API call lifecycle
  recordAPIStart(data: {
    requestId: string
    queryId: string
    model: string
    timestamp?: Date
    messageCount?: number
    toolCount?: number
  }): void {
    const apiCall: APICallMetric = {
      requestId: data.requestId,
      queryId: data.queryId,
      model: data.model,
      startTime: data.timestamp || new Date(),
      status: 'pending',
    }

    this.apiCalls.set(apiCall.requestId, apiCall)

    // Link to query
    const query = this.queries.get(data.queryId)
    if (query) {
      query.apiCalls.push(apiCall.requestId)
    }

    this.emit('event', { type: 'api:start', data: apiCall } as DashboardEvent)
  }

  recordFirstToken(data: {
    requestId: string
    ttftMs: number
    timestamp?: Date
  }): void {
    const apiCall = this.apiCalls.get(data.requestId)
    if (!apiCall) return

    apiCall.ttftMs = data.ttftMs
    apiCall.status = 'streaming'

    this.emit('event', {
      type: 'api:ttft',
      data: { requestId: data.requestId, ttftMs: data.ttftMs },
    } as DashboardEvent)
  }

  recordStreamEvent(data: {
    requestId: string
    type: StreamEventMetric['type']
    contentType?: StreamEventMetric['contentType']
    deltaSize?: number
    timestamp?: Date
  }): void {
    const event: StreamEventMetric = {
      requestId: data.requestId,
      timestamp: data.timestamp || new Date(),
      type: data.type,
      contentType: data.contentType,
      deltaSize: data.deltaSize,
    }

    this.streamEvents.push(event)

    // Prune stream events to prevent memory bloat
    if (this.streamEvents.length > this.maxHistorySize * 10) {
      this.streamEvents = this.streamEvents.slice(-this.maxHistorySize * 5)
    }

    this.emit('event', { type: 'api:stream', data: event } as DashboardEvent)
  }

  recordAPIEnd(data: {
    requestId: string
    stopReason?: string
    usage?: {
      inputTokens: number
      outputTokens: number
      cacheCreationTokens?: number
      cacheReadTokens?: number
    }
    timestamp?: Date
    error?: string
  }): void {
    const apiCall = this.apiCalls.get(data.requestId)
    if (!apiCall) return

    apiCall.endTime = data.timestamp || new Date()
    apiCall.totalDurationMs = apiCall.endTime.getTime() - apiCall.startTime.getTime()
    apiCall.stopReason = data.stopReason
    apiCall.status = data.error ? 'error' : 'completed'
    apiCall.error = data.error

    if (data.usage) {
      apiCall.inputTokens = data.usage.inputTokens
      apiCall.outputTokens = data.usage.outputTokens
      apiCall.cacheCreationTokens = data.usage.cacheCreationTokens || 0
      apiCall.cacheReadTokens = data.usage.cacheReadTokens || 0
    }

    this.emit('event', { type: 'api:end', data: apiCall } as DashboardEvent)
  }

  // Tool execution lifecycle
  recordToolStart(data: {
    id: string
    toolName: string
    queryId: string
    timestamp?: Date
  }): void {
    const toolCall: ToolCallMetric = {
      id: data.id,
      toolName: data.toolName,
      queryId: data.queryId,
      startTime: data.timestamp || new Date(),
      status: 'running',
    }

    this.toolCalls.set(toolCall.id, toolCall)

    // Link to query
    const query = this.queries.get(data.queryId)
    if (query) {
      query.toolCalls.push(toolCall.id)
    }

    this.emit('event', { type: 'tool:start', data: toolCall } as DashboardEvent)
  }

  recordToolEnd(data: {
    id: string
    timestamp?: Date
    success?: boolean
    error?: string
  }): void {
    const toolCall = this.toolCalls.get(data.id)
    if (!toolCall) return

    toolCall.endTime = data.timestamp || new Date()
    toolCall.durationMs = toolCall.endTime.getTime() - toolCall.startTime.getTime()
    toolCall.success = data.success ?? true
    toolCall.status = data.success === false ? 'error' : 'completed'
    toolCall.error = data.error

    this.emit('event', { type: 'tool:end', data: toolCall } as DashboardEvent)
  }

  // Get aggregate metrics
  getAggregateMetrics(): AggregateMetrics {
    const queries = Array.from(this.queries.values())
    const apiCalls = Array.from(this.apiCalls.values())
    const toolCalls = Array.from(this.toolCalls.values())

    const completedAPICalls = apiCalls.filter(c => c.status === 'completed')
    const completedToolCalls = toolCalls.filter(c => c.status === 'completed')

    const totalInputTokens = completedAPICalls.reduce((sum, c) => sum + (c.inputTokens || 0), 0)
    const totalOutputTokens = completedAPICalls.reduce((sum, c) => sum + (c.outputTokens || 0), 0)
    const totalCacheCreation = completedAPICalls.reduce((sum, c) => sum + (c.cacheCreationTokens || 0), 0)
    const totalCacheRead = completedAPICalls.reduce((sum, c) => sum + (c.cacheReadTokens || 0), 0)

    const totalCost = queries.reduce((sum, q) => sum + q.totalCost, 0)

    const ttftValues = completedAPICalls.filter(c => c.ttftMs).map(c => c.ttftMs!)
    const averageTTFT = ttftValues.length > 0
      ? ttftValues.reduce((sum, v) => sum + v, 0) / ttftValues.length
      : 0

    const durationValues = completedAPICalls.filter(c => c.totalDurationMs).map(c => c.totalDurationMs!)
    const averageAPIDuration = durationValues.length > 0
      ? durationValues.reduce((sum, v) => sum + v, 0) / durationValues.length
      : 0

    const cacheHitRate = (totalCacheCreation + totalCacheRead) > 0
      ? totalCacheRead / (totalCacheCreation + totalCacheRead)
      : 0

    const toolSuccessRate = completedToolCalls.length > 0
      ? completedToolCalls.filter(t => t.success).length / completedToolCalls.length
      : 0

    return {
      totalQueries: queries.length,
      activeQueries: queries.filter(q => q.status === 'in_progress').length,
      totalAPIRequests: apiCalls.length,
      activeAPIRequests: apiCalls.filter(c => c.status === 'pending' || c.status === 'streaming').length,
      totalToolCalls: toolCalls.length,
      activeToolCalls: toolCalls.filter(t => t.status === 'running').length,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreationTokens: totalCacheCreation,
      totalCacheReadTokens: totalCacheRead,
      totalCost,
      averageTTFT,
      averageAPIDuration,
      cacheHitRate,
      toolSuccessRate,
      timestamp: new Date(),
    }
  }

  // Get tool statistics
  getToolStats(): ToolStats[] {
    const toolCalls = Array.from(this.toolCalls.values())
    const toolMap = new Map<string, ToolCallMetric[]>()

    for (const call of toolCalls) {
      if (!toolMap.has(call.toolName)) {
        toolMap.set(call.toolName, [])
      }
      toolMap.get(call.toolName)!.push(call)
    }

    const stats: ToolStats[] = []
    for (const [toolName, calls] of toolMap.entries()) {
      const completedCalls = calls.filter(c => c.status === 'completed' || c.status === 'error')
      const successCount = completedCalls.filter(c => c.success).length
      const errorCount = completedCalls.filter(c => !c.success).length
      const durations = completedCalls.filter(c => c.durationMs).map(c => c.durationMs!)

      stats.push({
        toolName,
        count: calls.length,
        totalDuration: durations.reduce((sum, d) => sum + d, 0),
        averageDuration: durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0,
        successCount,
        errorCount,
        successRate: completedCalls.length > 0 ? successCount / completedCalls.length : 0,
      })
    }

    return stats.sort((a, b) => b.count - a.count)
  }

  // Get full history
  getHistory(): MetricsHistory {
    return {
      queries: Array.from(this.queries.values()),
      apiCalls: Array.from(this.apiCalls.values()),
      toolCalls: Array.from(this.toolCalls.values()),
      aggregates: this.getAggregateMetrics(),
      toolStats: this.getToolStats(),
    }
  }

  // Prune old data
  private pruneOldData(): void {
    const cutoff = new Date(Date.now() - this.retentionHours * 60 * 60 * 1000)

    // Remove old queries
    for (const [id, query] of this.queries.entries()) {
      if (query.endTime && query.endTime < cutoff) {
        this.queries.delete(id)
      }
    }

    // Remove old API calls
    for (const [id, apiCall] of this.apiCalls.entries()) {
      if (apiCall.endTime && apiCall.endTime < cutoff) {
        this.apiCalls.delete(id)
      }
    }

    // Remove old tool calls
    for (const [id, toolCall] of this.toolCalls.entries()) {
      if (toolCall.endTime && toolCall.endTime < cutoff) {
        this.toolCalls.delete(id)
      }
    }

    // Prune stream events
    this.streamEvents = this.streamEvents.filter(e => e.timestamp >= cutoff)
  }

  // Clear all data
  clear(): void {
    this.queries.clear()
    this.apiCalls.clear()
    this.toolCalls.clear()
    this.streamEvents = []
  }
}

// Singleton instance
let metricsCollectorInstance: MetricsCollector | null = null

export function getMetricsCollector(): MetricsCollector {
  if (!metricsCollectorInstance) {
    metricsCollectorInstance = new MetricsCollector()
  }
  return metricsCollectorInstance
}

export function createMetricsCollector(options?: {
  maxHistorySize?: number
  retentionHours?: number
}): MetricsCollector {
  metricsCollectorInstance = new MetricsCollector(options)
  return metricsCollectorInstance
}
