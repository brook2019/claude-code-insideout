/**
 * Type definitions for the monitoring dashboard
 */

export interface QueryMetric {
  id: string
  startTime: Date
  endTime?: Date
  source: string
  apiCalls: string[] // API request IDs
  toolCalls: string[] // Tool call IDs
  totalTokens: number
  totalCost: number
  status: 'in_progress' | 'completed' | 'error'
  error?: string
}

export interface APICallMetric {
  requestId: string
  queryId: string
  model: string
  startTime: Date
  endTime?: Date
  ttftMs?: number // Time to first token
  totalDurationMs?: number
  inputTokens?: number
  outputTokens?: number
  cacheCreationTokens?: number
  cacheReadTokens?: number
  stopReason?: string
  status: 'pending' | 'streaming' | 'completed' | 'error'
  error?: string
}

export interface ToolCallMetric {
  id: string
  toolName: string
  queryId: string
  startTime: Date
  endTime?: Date
  durationMs?: number
  success?: boolean
  error?: string
  status: 'running' | 'completed' | 'error'
}

export interface StreamEventMetric {
  requestId: string
  timestamp: Date
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop'
  contentType?: 'thinking' | 'text' | 'tool_use'
  deltaSize?: number
}

export interface AggregateMetrics {
  totalQueries: number
  activeQueries: number
  totalAPIRequests: number
  activeAPIRequests: number
  totalToolCalls: number
  activeToolCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  totalCost: number
  averageTTFT: number
  averageAPIDuration: number
  cacheHitRate: number
  toolSuccessRate: number
  timestamp: Date
}

export interface ToolStats {
  toolName: string
  count: number
  totalDuration: number
  averageDuration: number
  successCount: number
  errorCount: number
  successRate: number
}

// Dashboard events for WebSocket communication
export type DashboardEvent =
  | { type: 'query:start'; data: QueryMetric }
  | { type: 'query:end'; data: QueryMetric }
  | { type: 'api:start'; data: APICallMetric }
  | { type: 'api:ttft'; data: { requestId: string; ttftMs: number } }
  | { type: 'api:stream'; data: StreamEventMetric }
  | { type: 'api:end'; data: APICallMetric }
  | { type: 'tool:start'; data: ToolCallMetric }
  | { type: 'tool:end'; data: ToolCallMetric }
  | { type: 'metrics:snapshot'; data: AggregateMetrics }
  | { type: 'metrics:history'; data: MetricsHistory }

export interface MetricsHistory {
  queries: QueryMetric[]
  apiCalls: APICallMetric[]
  toolCalls: ToolCallMetric[]
  aggregates: AggregateMetrics
  toolStats: ToolStats[]
}

// Client subscription message
export interface SubscriptionMessage {
  type: 'subscribe'
  metrics: ('queries' | 'api' | 'tools' | 'aggregates')[]
}
