/**
 * Dashboard command implementation
 * Starts the web server and opens the dashboard in a browser
 */

import { execa } from 'execa'
import { logger } from '../../utils/logger.js'
import type { LocalCommandCall } from '../../types/command.js'
import {
  startDashboardServer,
  stopDashboardServer,
} from '../../services/dashboard/server.js'
import { enableDashboardMetrics } from '../../services/dashboard/integration.js'
import type { DashboardServerOptions } from '../../services/dashboard/server.js'

export const call: LocalCommandCall = async (_args, _context) => {
  const port = Number.parseInt(process.env.DASHBOARD_PORT || '8765')
  const host = process.env.DASHBOARD_HOST || 'localhost'
  const noOpen = process.env.DASHBOARD_NO_OPEN === '1'

  try {
    // Enable metrics collection
    enableDashboardMetrics()
    logger.info('Dashboard', 'Enabled dashboard metrics collection')

    // Start the dashboard server
    const serverOptions: DashboardServerOptions = {
      port,
      host,
    }

    const server = await startDashboardServer(serverOptions)
    const url = server.getURL()

    logger.info('Dashboard', `Dashboard server started at ${url}`)

    // Open browser if not disabled
    if (!noOpen) {
      try {
        await openBrowser(url)
        logger.info('Dashboard', 'Opened dashboard in browser')
      } catch (error) {
        logger.warn('Dashboard', `Failed to open browser: ${error}`)
        console.log(`\nDashboard is running at: ${url}`)
        console.log('Please open this URL in your browser manually.\n')
      }
    } else {
      console.log(`\nDashboard is running at: ${url}`)
      console.log('Open this URL in your browser to view the dashboard.\n')
    }

    return {
      type: 'text',
      value: `Dashboard is now running at ${url}\n\nThe dashboard will collect metrics from your queries in real-time.\nTo stop the dashboard, use Ctrl+C or close this session.`,
    }
  } catch (error) {
    logger.error('Dashboard', `Failed to start dashboard: ${error}`)
    return {
      type: 'text',
      value: `Failed to start dashboard: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Open a URL in the default browser
 * Works across platforms (macOS, Linux, Windows)
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform

  let command: string
  let args: string[]

  switch (platform) {
    case 'darwin': // macOS
      command = 'open'
      args = [url]
      break
    case 'win32': // Windows
      command = 'cmd'
      args = ['/c', 'start', url]
      break
    default: // Linux and others
      command = 'xdg-open'
      args = [url]
      break
  }

  try {
    await execa(command, args, {
      stdio: 'ignore',
      detached: true,
    })
  } catch (error) {
    throw new Error(`Failed to open browser: ${error}`)
  }
}

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', async () => {
  logger.info('Dashboard', 'Shutting down dashboard server...')
  await stopDashboardServer()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Dashboard', 'Shutting down dashboard server...')
  await stopDashboardServer()
  process.exit(0)
})
