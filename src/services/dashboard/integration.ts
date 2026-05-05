/**
 * Integration layer for dashboard metrics collection
 * Hooks into existing logging and API calls to collect metrics
 */

import { getMetricsCollector } from './metrics.js'
import { logger } from '../../utils/logger.js'

// Track whether dashboard is enabled
let dashboardEnabled = false

export function enableDashboardMetrics(): void {
  dashboardEnabled = true
  logger.info('Dashboard', 'Dashboard metrics collection enabled')
}

export function disableDashboardMetrics(): void {
  dashboardEnabled = false
  logger.info('Dashboard', 'Dashboard metrics collection disabled')
}

export function isDashboardEnabled(): boolean {
  return dashboardEnabled
}

// Helper to get metrics collector only if dashboard is enabled
function getCollector() {
  return dashboardEnabled ? getMetricsCollector() : null
}

/**
 * Record when a query starts
 */
export function recordQueryStart(queryId: string, source: string): void {
  const collector = getCollector()
  if (!collector) return

  collector.recordQueryStart({
    queryId,
    source,
    timestamp: new Date(),
  })
}

/**
 * Record when a query completes
 */
export function recordQueryEnd(
  queryId: string,
  status: 'completed' | 'error' = 'completed',
  error?: string,
): void {
  const collector = getCollector()
  if (!collector) return

  collector.recordQueryEnd({
    queryId,
    timestamp: new Date(),
    status,
    error,
  })
}

/**
 * Record when an API request starts
 */
export function recordAPIRequestStart(
  requestId: string,
  queryId: string,
  model: string,
  messageCount?: number,
  toolCount?: number,
): void {
  const collector = getCollector()
  if (!collector) return

  collector.recordAPIStart({
    requestId,
    queryId,
    model,
    timestamp: new Date(),
    messageCount,
    toolCount,
  })
}

/**
 * Record time to first token (TTFT)
 */
export function recordFirstToken(requestId: string, ttftMs: number): void {
  const collector = getCollector()
  if (!collector) return

  collector.recordFirstToken({
    requestId,
    ttftMs,
    timestamp: new Date(),
  })
}

/**
 * Record a stream event
 */
export function recordStreamEvent(
  requestId: string,
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop',
  contentType?: 'thinking' | 'text' | 'tool_use',
  deltaSize?: number,
): void {
  const collector = getCollector()
  if (!collector) return

  collector.recordStreamEvent({
    requestId,
    type,
    contentType,
    deltaSize,
    timestamp: new Date(),
  })
}

/**
 * Record when an API request completes
 */
export function recordAPIRequestEnd(
  requestId: string,
  stopReason?: string,
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens?: number
    cacheReadTokens?: number
  },
  error?: string,
): void {
  const collector = getCollector()
  if (!collector) return

  collector.recordAPIEnd({
    requestId,
    stopReason,
    usage,
    timestamp: new Date(),
    error,
  })
}

/**
 * Record when a tool execution starts
 */
export function recordToolExecutionStart(
  toolId: string,
  toolName: string,
  queryId: string,
): void {
  const collector = getCollector()
  if (!collector) return

  collector.recordToolStart({
    id: toolId,
    toolName,
    queryId,
    timestamp: new Date(),
  })
}

/**
 * Record when a tool execution completes
 */
export function recordToolExecutionEnd(
  toolId: string,
  success: boolean = true,
  error?: string,
): void {
  const collector = getCollector()
  if (!collector) return

  collector.recordToolEnd({
    id: toolId,
    timestamp: new Date(),
    success,
    error,
  })
}

/**
 * Helper to extract query ID from context
 * This should be adapted based on how query IDs are tracked in the codebase
 */
export function getCurrentQueryId(): string {
  // TODO: Implement proper query ID tracking
  // For now, generate a temporary ID
  return `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}
