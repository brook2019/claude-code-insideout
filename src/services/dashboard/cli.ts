/**
 * CLI entry point for the monitoring dashboard.
 *
 * Usage:
 *   bun run src/services/dashboard/cli.ts [--port PORT] [--demo]
 *
 * --port PORT   Listen on PORT (default: 8765)
 * --demo        Inject synthetic metrics so the dashboard has data to show
 */

import { startDashboardServer, stopDashboardServer } from './server.js'
import { enableDashboardMetrics } from './integration.js'
import { getMetricsCollector } from './metrics.js'

function parseArgs(args: string[]): { port: number; demo: boolean } {
  let port = 8765
  let demo = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1]!, 10)
      i++
    } else if (args[i] === '--demo') {
      demo = true
    }
  }
  return { port, demo }
}

function generateDemoMetrics(): void {
  const collector = getMetricsCollector()
  const models = ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-5-20251001']
  const tools = ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'Agent']

  let queryCount = 0

  function addQuery() {
    queryCount++
    const queryId = `demo-query-${queryCount}`
    const model = models[Math.floor(Math.random() * models.length)]!
    const numApiCalls = 1 + Math.floor(Math.random() * 3)
    const numToolCalls = Math.floor(Math.random() * 5)

    collector.recordQueryStart({ queryId, source: 'demo' })

    // API calls
    for (let i = 0; i < numApiCalls; i++) {
      const requestId = `${queryId}-api-${i}`
      const ttft = 500 + Math.random() * 2000
      const duration = ttft + Math.random() * 5000
      const inputTokens = Math.floor(1000 + Math.random() * 20000)
      const outputTokens = Math.floor(200 + Math.random() * 4000)
      const cacheRead = Math.floor(inputTokens * (0.5 + Math.random() * 0.45))
      const cacheCreation = Math.floor(Math.random() * 1000)

      collector.recordAPIStart({ requestId, queryId, model, timestamp: new Date() })
      collector.recordFirstToken({ requestId, ttftMs: ttft })
      collector.recordAPIEnd({
        requestId,
        stopReason: 'end_turn',
        usage: {
          inputTokens,
          outputTokens,
          cacheCreationTokens: cacheCreation,
          cacheReadTokens: cacheRead,
        },
      })
    }

    // Tool calls
    for (let i = 0; i < numToolCalls; i++) {
      const toolId = `${queryId}-tool-${i}`
      const toolName = tools[Math.floor(Math.random() * tools.length)]!
      const success = Math.random() > 0.05

      collector.recordToolStart({ id: toolId, toolName, queryId })
      collector.recordToolEnd({ id: toolId, success, error: success ? undefined : 'Permission denied' })
    }

    collector.recordQueryEnd({ queryId, status: 'completed' })
  }

  // Seed with some historical data
  for (let i = 0; i < 5; i++) {
    addQuery()
  }

  // Add new queries periodically
  setInterval(() => addQuery(), 3000 + Math.random() * 5000)
}

async function main() {
  const { port, demo } = parseArgs(process.argv.slice(2))

  enableDashboardMetrics()

  const server = await startDashboardServer({ port })
  const url = server.getURL()
  console.log(`\n  Dashboard running at: ${url}\n`)

  if (demo) {
    console.log('  Demo mode: generating synthetic metrics...\n')
    generateDemoMetrics()
  } else {
    console.log('  Waiting for Claude Code metrics...')
    console.log('  (Use --demo flag to generate synthetic data)\n')
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n  Shutting down dashboard...')
    await stopDashboardServer()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await stopDashboardServer()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Failed to start dashboard:', err)
  process.exit(1)
})
