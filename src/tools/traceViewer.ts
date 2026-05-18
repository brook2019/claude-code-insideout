/**
 * Interactive Trace Viewer
 *
 * Parses JSONL session transcripts into a standalone, browsable HTML timeline.
 * Visualizes: API calls, tool executions, token usage, cache hits, timing,
 * and agent spawn trees (parent → subagent relationships).
 *
 * Usage:
 *   bun run src/tools/traceViewer.ts <session.jsonl> [-o output.html]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TranscriptEntry {
  type: string
  subtype?: string
  uuid?: string
  parentUuid?: string | null
  isSidechain?: boolean
  agentId?: string
  sessionId?: string
  cwd?: string
  version?: string
  gitBranch?: string
  timestamp?: string
  userType?: string
  message?: {
    role: string
    content: string | ContentBlock[]
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
    stop_reason?: string
  }
  // Metadata entry fields
  customTitle?: string
  tag?: string
  lastPrompt?: string
  agentName?: string
  agentColor?: string
  agentSetting?: string
  mode?: string
  // File history
  messageId?: string
  snapshot?: Record<string, unknown>
  // Content replacement
  replacements?: unknown[]
}

interface ContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  content?: string | ContentBlock[]
  thinking?: string
  tool_use_id?: string
}

interface ParsedMessage {
  type: 'user' | 'assistant' | 'system' | 'attachment' | 'metadata'
  uuid: string
  parentUuid: string | null
  timestamp: string
  isSidechain: boolean
  agentId?: string
  sessionId?: string
  role: string
  textPreview: string
  toolUses: ToolUse[]
  toolResults: ToolResult[]
  thinking: string[]
  tokens?: { input: number; output: number; cacheRead: number; cacheCreation: number }
  model?: string
  stopReason?: string
  duration?: number
}

interface ToolUse {
  id: string
  name: string
  inputPreview: string
}

interface ToolResult {
  toolUseId: string
  contentPreview: string
  isError: boolean
}

interface SubagentInfo {
  agentId: string
  type?: string
  description?: string
  messageCount: number
}

interface TraceData {
  sessionId: string
  title: string
  tag?: string
  mode?: string
  version?: string
  gitBranch?: string
  messages: ParsedMessage[]
  subagents: SubagentInfo[]
  totalTokens: { input: number; output: number; cacheRead: number; cacheCreation: number }
  totalMessages: number
  totalToolCalls: number
  timeRange: { start: string; end: string }
}

// ─── Parse ──────────────────────────────────────────────────────────────────

function parseTranscript(jsonlContent: string): TraceData {
  const lines = jsonlContent.split('\n').filter(l => l.trim())
  const messages: ParsedMessage[] = []
  let sessionId = ''
  let title = ''
  let tag: string | undefined
  let mode: string | undefined
  let version: string | undefined
  let gitBranch: string | undefined
  const agentMessages = new Map<string, number>()
  const totalTokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }
  let totalToolCalls = 0

  for (const line of lines) {
    let entry: TranscriptEntry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    // Extract metadata
    if (entry.type === 'custom-title') {
      title = entry.customTitle || title
      continue
    }
    if (entry.type === 'tag') {
      tag = entry.tag
      continue
    }
    if (entry.type === 'mode') {
      mode = entry.mode
      continue
    }
    if (entry.type === 'last-prompt' || entry.type === 'agent-name' ||
        entry.type === 'agent-color' || entry.type === 'agent-setting' ||
        entry.type === 'worktree-state' || entry.type === 'pr-link' ||
        entry.type === 'summary' || entry.type === 'file-history-snapshot' ||
        entry.type === 'attribution-snapshot' || entry.type === 'content-replacement' ||
        entry.type === 'context-collapse-commit' || entry.type === 'context-collapse-snapshot' ||
        entry.type === 'queue-operation') {
      continue
    }

    if (!entry.uuid || !entry.message) continue

    // Track session info
    if (!sessionId && entry.sessionId) sessionId = entry.sessionId
    if (!version && entry.version) version = entry.version
    if (!gitBranch && entry.gitBranch) gitBranch = entry.gitBranch

    // Track subagent messages
    if (entry.agentId) {
      agentMessages.set(entry.agentId, (agentMessages.get(entry.agentId) || 0) + 1)
    }

    const msg = entry.message
    const content = msg.content
    const textParts: string[] = []
    const toolUses: ToolUse[] = []
    const toolResults: ToolResult[] = []
    const thinkingParts: string[] = []

    if (typeof content === 'string') {
      textParts.push(content)
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          textParts.push(block.text)
        } else if (block.type === 'thinking' && block.thinking) {
          thinkingParts.push(block.thinking)
        } else if (block.type === 'tool_use' && block.name) {
          totalToolCalls++
          toolUses.push({
            id: block.id || '',
            name: block.name,
            inputPreview: block.input ? truncate(JSON.stringify(block.input), 200) : '',
          })
        } else if (block.type === 'tool_result') {
          const resultContent = typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map(b => b.text || '').join('\n')
              : ''
          toolResults.push({
            toolUseId: block.tool_use_id || '',
            contentPreview: truncate(resultContent, 200),
            isError: false,
          })
        }
      }
    }

    // Token tracking
    let tokens: ParsedMessage['tokens']
    if (msg.usage) {
      tokens = {
        input: msg.usage.input_tokens || 0,
        output: msg.usage.output_tokens || 0,
        cacheRead: msg.usage.cache_read_input_tokens || 0,
        cacheCreation: msg.usage.cache_creation_input_tokens || 0,
      }
      totalTokens.input += tokens.input
      totalTokens.output += tokens.output
      totalTokens.cacheRead += tokens.cacheRead
      totalTokens.cacheCreation += tokens.cacheCreation
    }

    const isCompactBoundary = entry.type === 'system' && entry.subtype === 'compact_boundary'

    messages.push({
      type: entry.type as ParsedMessage['type'],
      uuid: entry.uuid,
      parentUuid: entry.parentUuid || null,
      timestamp: entry.timestamp || '',
      isSidechain: entry.isSidechain || false,
      agentId: entry.agentId,
      sessionId: entry.sessionId,
      role: msg.role,
      textPreview: isCompactBoundary
        ? '[COMPACT BOUNDARY]'
        : truncate(textParts.join('\n'), 300),
      toolUses,
      toolResults,
      thinking: thinkingParts.map(t => truncate(t, 500)),
      tokens,
      model: msg.model,
      stopReason: msg.stop_reason,
    })
  }

  // Build subagent info
  const subagents: SubagentInfo[] = Array.from(agentMessages.entries()).map(
    ([agentId, count]) => ({ agentId, messageCount: count }),
  )

  const timestamps = messages.filter(m => m.timestamp).map(m => m.timestamp)
  const timeRange = {
    start: timestamps[0] || '',
    end: timestamps[timestamps.length - 1] || '',
  }

  return {
    sessionId,
    title: title || `Session ${sessionId.slice(0, 8)}`,
    tag,
    mode,
    version,
    gitBranch,
    messages,
    subagents,
    totalTokens,
    totalMessages: messages.length,
    totalToolCalls,
    timeRange,
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '...'
}

// ─── HTML Generation ────────────────────────────────────────────────────────

function generateHTML(data: TraceData): string {
  const messagesJSON = JSON.stringify(data.messages)
  const subagentsJSON = JSON.stringify(data.subagents)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Trace: ${escapeHtml(data.title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace; background: #0d1117; color: #c9d1d9; }

  .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; }
  .header h1 { font-size: 20px; color: #f0f6fc; margin-bottom: 4px; }
  .header .meta { font-size: 13px; color: #8b949e; display: flex; gap: 16px; flex-wrap: wrap; }
  .header .meta span { display: inline-flex; align-items: center; gap: 4px; }

  .stats { display: flex; gap: 12px; padding: 12px 24px; background: #0d1117; border-bottom: 1px solid #21262d; flex-wrap: wrap; }
  .stat { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 8px 14px; min-width: 120px; }
  .stat .label { font-size: 11px; color: #8b949e; text-transform: uppercase; }
  .stat .value { font-size: 18px; font-weight: 700; color: #f0f6fc; }

  .controls { padding: 10px 24px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .controls label { font-size: 13px; color: #8b949e; }
  .controls input[type="checkbox"] { margin-right: 4px; }
  .controls input[type="text"] { background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 4px 8px; border-radius: 4px; font-size: 13px; width: 200px; }
  .controls select { background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 4px 8px; border-radius: 4px; font-size: 13px; }

  .timeline { padding: 16px 24px; }

  .msg { border: 1px solid #21262d; border-radius: 8px; margin-bottom: 8px; overflow: hidden; transition: all 0.15s; }
  .msg:hover { border-color: #388bfd44; }
  .msg.user { border-left: 3px solid #3b82f6; }
  .msg.assistant { border-left: 3px solid #a78bfa; }
  .msg.system { border-left: 3px solid #f59e0b; }
  .msg.attachment { border-left: 3px solid #6b7280; }
  .msg.compact-boundary { border-left: 3px solid #ef4444; background: #1c1014; }
  .msg.sidechain { opacity: 0.7; margin-left: 32px; }

  .msg-header { padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: #161b22; }
  .msg-header:hover { background: #1c2128; }
  .msg-role { font-weight: 600; font-size: 13px; text-transform: uppercase; }
  .msg-role.user { color: #58a6ff; }
  .msg-role.assistant { color: #bc8cff; }
  .msg-role.system { color: #d29922; }
  .msg-badges { display: flex; gap: 6px; align-items: center; }
  .badge { font-size: 11px; padding: 2px 6px; border-radius: 4px; }
  .badge.tokens { background: #1f3a5f; color: #58a6ff; }
  .badge.tool { background: #2a1f3f; color: #bc8cff; }
  .badge.thinking { background: #3f2a1f; color: #f59e0b; }
  .badge.agent { background: #1f3f2a; color: #4ade80; }
  .badge.time { background: #21262d; color: #8b949e; }

  .msg-body { display: none; padding: 12px; background: #0d1117; border-top: 1px solid #21262d; }
  .msg-body.open { display: block; }
  .msg-text { white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.5; max-height: 400px; overflow-y: auto; }
  .msg-section { margin-top: 10px; }
  .msg-section h4 { font-size: 12px; color: #8b949e; margin-bottom: 4px; text-transform: uppercase; }

  .tool-item { background: #161b22; border: 1px solid #30363d; border-radius: 4px; padding: 8px; margin-bottom: 4px; font-size: 12px; }
  .tool-name { color: #bc8cff; font-weight: 600; }
  .tool-input { color: #8b949e; margin-top: 4px; white-space: pre-wrap; word-break: break-word; max-height: 150px; overflow-y: auto; }

  .thinking-block { background: #1c1a12; border: 1px solid #3f3a1f; border-radius: 4px; padding: 8px; margin-bottom: 4px; font-size: 12px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; color: #d29922; }

  .subagents { padding: 16px 24px; border-top: 1px solid #21262d; }
  .subagents h3 { font-size: 14px; color: #f0f6fc; margin-bottom: 8px; }
  .agent-item { display: inline-block; background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 6px 12px; margin: 4px; font-size: 12px; cursor: pointer; }
  .agent-item:hover { border-color: #4ade80; }
  .agent-item .agent-id { color: #4ade80; font-weight: 600; }
  .agent-item .agent-count { color: #8b949e; }

  .empty { text-align: center; padding: 40px; color: #484f58; }

  @media (max-width: 768px) {
    .stats { flex-direction: column; }
    .controls { flex-direction: column; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>${escapeHtml(data.title)}</h1>
  <div class="meta">
    <span>Session: ${escapeHtml(data.sessionId.slice(0, 8))}</span>
    ${data.mode ? `<span>Mode: ${escapeHtml(data.mode)}</span>` : ''}
    ${data.version ? `<span>v${escapeHtml(data.version)}</span>` : ''}
    ${data.gitBranch ? `<span>Branch: ${escapeHtml(data.gitBranch)}</span>` : ''}
    ${data.tag ? `<span>Tag: ${escapeHtml(data.tag)}</span>` : ''}
    ${data.timeRange.start ? `<span>${escapeHtml(formatTime(data.timeRange.start))} - ${escapeHtml(formatTime(data.timeRange.end))}</span>` : ''}
  </div>
</div>

<div class="stats">
  <div class="stat"><div class="label">Messages</div><div class="value">${data.totalMessages}</div></div>
  <div class="stat"><div class="label">Tool Calls</div><div class="value">${data.totalToolCalls}</div></div>
  <div class="stat"><div class="label">Input Tokens</div><div class="value">${formatNum(data.totalTokens.input)}</div></div>
  <div class="stat"><div class="label">Output Tokens</div><div class="value">${formatNum(data.totalTokens.output)}</div></div>
  <div class="stat"><div class="label">Cache Read</div><div class="value">${formatNum(data.totalTokens.cacheRead)}</div></div>
  <div class="stat"><div class="label">Subagents</div><div class="value">${data.subagents.length}</div></div>
</div>

<div class="controls">
  <label><input type="checkbox" id="showSidechains" checked> Show subagent messages</label>
  <label><input type="checkbox" id="showSystem"> Show system messages</label>
  <label><input type="checkbox" id="showThinking"> Expand thinking blocks</label>
  <label>Filter: <input type="text" id="filterText" placeholder="Search messages..."></label>
  <label>Type: <select id="filterType">
    <option value="all">All</option>
    <option value="user">User</option>
    <option value="assistant">Assistant</option>
    <option value="system">System</option>
  </select></label>
</div>

${data.subagents.length > 0 ? `
<div class="subagents">
  <h3>Subagent Tree</h3>
  ${data.subagents.map(a => `
    <div class="agent-item" onclick="filterByAgent('${escapeHtml(a.agentId)}')">
      <span class="agent-id">${escapeHtml(a.agentId.slice(0, 12))}</span>
      <span class="agent-count">${a.messageCount} msgs</span>
    </div>
  `).join('')}
  <div class="agent-item" onclick="filterByAgent('')">
    <span class="agent-id">Show All</span>
  </div>
</div>
` : ''}

<div class="timeline" id="timeline"></div>

<script>
const messages = ${messagesJSON};
const subagents = ${subagentsJSON};
let activeAgent = '';

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatNum(n) {
  return n >= 1000000 ? (n / 1000000).toFixed(1) + 'M'
       : n >= 1000 ? (n / 1000).toFixed(1) + 'K'
       : n.toString();
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

function renderTimeline() {
  const showSide = document.getElementById('showSidechains').checked;
  const showSys = document.getElementById('showSystem').checked;
  const filterText = document.getElementById('filterText').value.toLowerCase();
  const filterType = document.getElementById('filterType').value;
  const timeline = document.getElementById('timeline');

  const filtered = messages.filter(m => {
    if (!showSide && m.isSidechain) return false;
    if (!showSys && m.type === 'system') return false;
    if (filterType !== 'all' && m.type !== filterType) return false;
    if (activeAgent && m.agentId !== activeAgent) return false;
    if (filterText) {
      const searchable = (m.textPreview + ' ' + m.toolUses.map(t => t.name).join(' ')).toLowerCase();
      if (!searchable.includes(filterText)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    timeline.innerHTML = '<div class="empty">No messages match filters</div>';
    return;
  }

  timeline.innerHTML = filtered.map((m, i) => {
    const isCompact = m.textPreview === '[COMPACT BOUNDARY]';
    const classes = [
      'msg',
      m.type,
      m.isSidechain ? 'sidechain' : '',
      isCompact ? 'compact-boundary' : '',
    ].filter(Boolean).join(' ');

    const badges = [];
    if (m.tokens) badges.push('<span class="badge tokens">In:' + formatNum(m.tokens.input) + ' Out:' + formatNum(m.tokens.output) + '</span>');
    if (m.toolUses.length) badges.push('<span class="badge tool">' + m.toolUses.length + ' tool' + (m.toolUses.length > 1 ? 's' : '') + '</span>');
    if (m.thinking.length) badges.push('<span class="badge thinking">thinking</span>');
    if (m.agentId) badges.push('<span class="badge agent">' + escapeHtml(m.agentId.slice(0, 8)) + '</span>');
    if (m.timestamp) badges.push('<span class="badge time">' + formatTime(m.timestamp) + '</span>');

    const toolsHTML = m.toolUses.map(t =>
      '<div class="tool-item"><span class="tool-name">' + escapeHtml(t.name) + '</span>' +
      (t.inputPreview ? '<div class="tool-input">' + escapeHtml(t.inputPreview) + '</div>' : '') +
      '</div>'
    ).join('');

    const resultsHTML = m.toolResults.map(r =>
      '<div class="tool-item"><span class="tool-name">result</span>' +
      '<div class="tool-input">' + escapeHtml(r.contentPreview) + '</div></div>'
    ).join('');

    const thinkingHTML = m.thinking.map(t =>
      '<div class="thinking-block">' + escapeHtml(t) + '</div>'
    ).join('');

    return '<div class="' + classes + '">' +
      '<div class="msg-header" onclick="toggleMsg(' + i + ')">' +
        '<span class="msg-role ' + m.type + '">' + m.role + (isCompact ? ' [COMPACT]' : '') + '</span>' +
        '<div class="msg-badges">' + badges.join('') + '</div>' +
      '</div>' +
      '<div class="msg-body" id="msg-' + i + '">' +
        (m.textPreview ? '<div class="msg-text">' + escapeHtml(m.textPreview) + '</div>' : '') +
        (thinkingHTML ? '<div class="msg-section"><h4>Thinking</h4>' + thinkingHTML + '</div>' : '') +
        (toolsHTML ? '<div class="msg-section"><h4>Tool Uses</h4>' + toolsHTML + '</div>' : '') +
        (resultsHTML ? '<div class="msg-section"><h4>Tool Results</h4>' + resultsHTML + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function toggleMsg(i) {
  const el = document.getElementById('msg-' + i);
  if (el) el.classList.toggle('open');
}

function filterByAgent(agentId) {
  activeAgent = agentId;
  renderTimeline();
}

// Bind controls
['showSidechains', 'showSystem', 'showThinking'].forEach(id => {
  document.getElementById(id).addEventListener('change', renderTimeline);
});
document.getElementById('filterText').addEventListener('input', renderTimeline);
document.getElementById('filterType').addEventListener('change', renderTimeline);

// Initial render
renderTimeline();
</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString()
  } catch {
    return ts
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
  Interactive Trace Viewer

  Usage: bun run src/tools/traceViewer.ts <session.jsonl> [-o output.html]

  Arguments:
    <session.jsonl>    Path to a JSONL session transcript
    -o, --output       Output HTML file path (default: trace-<session>.html)

  The output is a standalone HTML file — no server required.
  Open it in any browser to explore the session timeline.
`)
    process.exit(0)
  }

  let inputPath = ''
  let outputPath = ''

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-o' || args[i] === '--output') && args[i + 1]) {
      outputPath = args[i + 1]!
      i++
    } else if (!inputPath) {
      inputPath = args[i]!
    }
  }

  if (!inputPath) {
    console.error('Error: No input file specified')
    process.exit(1)
  }

  console.log(`Reading transcript: ${inputPath}`)
  const content = readFileSync(inputPath, 'utf-8')

  console.log('Parsing transcript...')
  const data = parseTranscript(content)

  // Check for subagent transcripts
  const sessionDir = inputPath.replace(/\.jsonl$/, '')
  const subagentDir = join(sessionDir, 'subagents')
  try {
    const subFiles = readdirSync(subagentDir)
    for (const file of subFiles) {
      if (!file.endsWith('.jsonl')) continue
      const subContent = readFileSync(join(subagentDir, file), 'utf-8')
      const subData = parseTranscript(subContent)
      // Merge subagent messages into main timeline
      for (const msg of subData.messages) {
        msg.isSidechain = true
        if (!msg.agentId) msg.agentId = file.replace(/^agent-/, '').replace(/\.jsonl$/, '')
      }
      data.messages.push(...subData.messages)
      data.totalTokens.input += subData.totalTokens.input
      data.totalTokens.output += subData.totalTokens.output
      data.totalTokens.cacheRead += subData.totalTokens.cacheRead
      data.totalTokens.cacheCreation += subData.totalTokens.cacheCreation
      data.totalToolCalls += subData.totalToolCalls
    }
    // Re-sort by timestamp
    data.messages.sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    })
  } catch {
    // No subagent directory — that's fine
  }

  if (!outputPath) {
    const baseName = basename(inputPath, '.jsonl')
    outputPath = join(dirname(inputPath), `trace-${baseName}.html`)
  }

  console.log(`Generating HTML: ${outputPath}`)
  console.log(`  Messages: ${data.totalMessages}`)
  console.log(`  Tool calls: ${data.totalToolCalls}`)
  console.log(`  Subagents: ${data.subagents.length}`)
  console.log(`  Tokens: ${formatNum(data.totalTokens.input)} in / ${formatNum(data.totalTokens.output)} out`)

  const html = generateHTML(data)
  writeFileSync(outputPath, html, 'utf-8')

  console.log(`\nDone! Open in browser: ${outputPath}`)
}

main()
