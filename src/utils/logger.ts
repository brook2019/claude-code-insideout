/**
 * Cross-platform logging utility for claude-code-insideout
 *
 * Provides configurable file-based logging that works on Linux, macOS, and Windows.
 *
 * Environment variables:
 * - CLAUDE_CODE_DEBUG_LOG: Path to log file (default: auto-detected based on platform)
 * - CLAUDE_CODE_DEBUG_ENABLED: Set to '1' or 'true' to enable logging (default: enabled)
 *
 * Default log locations:
 * - Linux/macOS: ~/.claude/logs/debug.log
 * - Windows: %USERPROFILE%\.claude\logs\debug.log
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

let logFilePath: string | null = null
let loggingEnabled = true

/**
 * Get the default log file path based on the platform
 */
function getDefaultLogPath(): string {
  const home = homedir()
  const claudeDir = join(home, '.claude', 'logs')

  // Fallback to temp directory if home is not accessible
  try {
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true })
    }
    return join(claudeDir, 'debug.log')
  } catch (error) {
    // Fallback to temp directory
    const tempLog = join(tmpdir(), 'claude-code-debug.log')
    console.warn(`[Logger] Failed to create log directory in home, using temp: ${tempLog}`)
    return tempLog
  }
}

/**
 * Initialize the logger configuration
 */
function initLogger() {
  if (logFilePath !== null) return // Already initialized

  // Check if logging is disabled
  const debugEnabled = process.env.CLAUDE_CODE_DEBUG_ENABLED
  if (debugEnabled === '0' || debugEnabled === 'false') {
    loggingEnabled = false
    logFilePath = '' // Set to empty to mark as initialized
    return
  }

  // Use custom path if provided, otherwise use default
  logFilePath = process.env.CLAUDE_CODE_DEBUG_LOG || getDefaultLogPath()

  // Expand ~ to home directory if present
  if (logFilePath.startsWith('~/')) {
    logFilePath = join(homedir(), logFilePath.slice(2))
  }

  // Ensure the directory exists
  try {
    const logDir = dirname(logFilePath)
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
  } catch (error) {
    console.error(`[Logger] Failed to create log directory: ${error}`)
    loggingEnabled = false
  }
}

/**
 * Log levels
 */
export enum LogLevel {
  TRACE = 'TRACE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

/**
 * Format a log message with timestamp and level
 */
function formatLogMessage(level: LogLevel, component: string, message: string): string {
  const timestamp = new Date().toISOString()
  return `[${timestamp}] [${level}] [${component}] ${message}\n`
}

/**
 * Write a log message to the file
 */
export function logToFile(level: LogLevel, component: string, message: string): void {
  if (logFilePath === null) {
    initLogger()
  }

  if (!loggingEnabled || !logFilePath) {
    console.log(`[Logger] Skipping log - enabled: ${loggingEnabled}, path: ${logFilePath}`)
    return
  }

  try {
    const formattedMessage = formatLogMessage(level, component, message)
    appendFileSync(logFilePath, formattedMessage)
  } catch (error) {
    // Always show errors for debugging
    console.error(`[Logger] Failed to write log: ${error}`)
  }
}

/**
 * Convenience logging functions
 */
export const logger = {
  trace: (component: string, message: string) => logToFile(LogLevel.TRACE, component, message),
  debug: (component: string, message: string) => logToFile(LogLevel.DEBUG, component, message),
  info: (component: string, message: string) => logToFile(LogLevel.INFO, component, message),
  warn: (component: string, message: string) => logToFile(LogLevel.WARN, component, message),
  error: (component: string, message: string) => logToFile(LogLevel.ERROR, component, message),

  /**
   * Get the current log file path
   */
  getLogPath: (): string | null => {
    if (logFilePath === null) {
      initLogger()
    }
    return logFilePath || null
  },

  /**
   * Check if logging is enabled
   */
  isEnabled: (): boolean => {
    if (logFilePath === null) {
      initLogger()
    }
    return loggingEnabled
  },
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use logger.trace() instead
 */
export function logTrace(component: string, message: string): void {
  logger.trace(component, message)
}

// Log initialization on first import
if (process.env.CLAUDE_CODE_DEBUG_ENABLED !== '0' && process.env.CLAUDE_CODE_DEBUG_ENABLED !== 'false') {
  initLogger()
  if (loggingEnabled && logFilePath) {
    console.log(`[Logger] Debug logging enabled: ${logFilePath}`)
  }
}
