/**
 * System Prompt Diff Tool
 *
 * Extracts rendered system prompts from JSONL session transcripts and
 * compares them side-by-side. Useful for understanding how prompts differ
 * across contexts (CLI vs SDK, different models, with/without MCP, etc.).
 *
 * Usage:
 *   bun run src/tools/systemPromptDiff.ts extract <session.jsonl> [-o prompt.md]
 *   bun run src/tools/systemPromptDiff.ts diff <file1.md> <file2.md> [-o diff.html]
 *   bun run src/tools/systemPromptDiff.ts compare <session1.jsonl> <session2.jsonl> [-o diff.html]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SystemPromptBlock {
  index: number
  text: string
  cacheControl?: string
  label: string
}

interface ExtractedPrompt {
  sessionId: string
  model?: string
  version?: string
  timestamp?: string
  blocks: SystemPromptBlock[]
  fullText: string
}

interface DiffLine {
  type: 'same' | 'added' | 'removed' | 'changed'
  lineNum1?: number
  lineNum2?: number
  text1: string
  text2: string
}

// ─── Extract ────────────────────────────────────────────────────────────────

function extractSystemPrompt(jsonlPath: string): ExtractedPrompt {
  const content = readFileSync(jsonlPath, 'utf-8')
  const lines = content.split('\n').filter(l => l.trim())

  let sessionId = ''
  let model: string | undefined
  let version: string | undefined
  let timestamp: string | undefined
  const systemBlocks: SystemPromptBlock[] = []

  for (const line of lines) {
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }

    // Grab metadata
    if (!sessionId && entry.sessionId) sessionId = entry.sessionId as string
    if (!version && entry.version) version = entry.version as string
    if (!timestamp && entry.timestamp) timestamp = entry.timestamp as string

    // Check for system messages that contain prompt sections
    if (entry.type === 'system' && entry.message) {
      const msg = entry.message as Record<string, unknown>
      if (msg.role === 'system' || entry.subtype === 'system_prompt') {
        const msgContent = msg.content
        if (typeof msgContent === 'string') {
          systemBlocks.push({
            index: systemBlocks.length,
            text: msgContent,
            label: 'System block ' + systemBlocks.length,
          })
        } else if (Array.isArray(msgContent)) {
          for (const block of msgContent as Record<string, unknown>[]) {
            if (block.type === 'text' && typeof block.text === 'string') {
              systemBlocks.push({
                index: systemBlocks.length,
                text: block.text as string,
                cacheControl: (block.cache_control as Record<string, string>)?.type,
                label: identifySection(block.text as string),
              })
            }
          }
        }
      }
    }

    // Also check for assistant messages that may embed model info
    if (entry.type === 'assistant' && entry.message) {
      const msg = entry.message as Record<string, unknown>
      if (msg.model && !model) model = msg.model as string
    }
  }

  // If no system messages found, try to extract system-reminder tags
  // from user messages
  if (systemBlocks.length === 0) {
    for (const line of lines) {
      let entry: Record<string, unknown>
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }

      if (entry.type === 'user' && entry.message) {
        const msg = entry.message as Record<string, unknown>
        const msgContent = msg.content
        if (typeof msgContent === 'string') {
          const systemReminders = extractSystemReminders(msgContent)
          for (const reminder of systemReminders) {
            systemBlocks.push({
              index: systemBlocks.length,
              text: reminder,
              label: identifySection(reminder),
            })
          }
          if (systemBlocks.length > 0) break
        } else if (Array.isArray(msgContent)) {
          for (const block of msgContent as Record<string, unknown>[]) {
            if (block.type === 'text' && typeof block.text === 'string') {
              const systemReminders = extractSystemReminders(block.text as string)
              for (const reminder of systemReminders) {
                systemBlocks.push({
                  index: systemBlocks.length,
                  text: reminder,
                  label: identifySection(reminder),
                })
              }
            }
          }
          if (systemBlocks.length > 0) break
        }
      }
    }
  }

  const fullText = systemBlocks.map(b => b.text).join('\n\n---\n\n')

  return { sessionId, model, version, timestamp, blocks: systemBlocks, fullText }
}

function extractSystemReminders(text: string): string[] {
  const reminders: string[] = []
  const parts = text.split('<system-reminder>')
  for (let i = 1; i < parts.length; i++) {
    const endIdx = parts[i]!.indexOf('</system-reminder>')
    if (endIdx >= 0) {
      reminders.push(parts[i]!.slice(0, endIdx).trim())
    }
  }
  return reminders
}

function identifySection(text: string): string {
  const lower = text.slice(0, 200).toLowerCase()
  if (lower.includes('you are claude code')) return 'Core Identity'
  if (lower.includes('doing tasks')) return 'Task Instructions'
  if (lower.includes('using your tools')) return 'Tool Usage'
  if (lower.includes('tone and style')) return 'Tone and Style'
  if (lower.includes('environment')) return 'Environment Info'
  if (lower.includes('mcp server')) return 'MCP Instructions'
  if (lower.includes('memory')) return 'Memory System'
  if (lower.includes('session-specific')) return 'Session Guidance'
  if (lower.includes('skill')) return 'Skills'
  if (lower.includes('output efficiency')) return 'Output Efficiency'
  if (lower.includes('executing actions')) return 'Action Safety'
  if (lower.includes('cache') || lower.includes('caching')) return 'Caching'
  if (lower.includes('language')) return 'Language'
  if (lower.includes('scratchpad')) return 'Scratchpad'
  const preview = text.slice(0, 50).replace(/\n/g, ' ')
  return 'Block: ' + preview + (text.length > 50 ? '...' : '')
}

// ─── Diff ───────────────────────────────────────────────────────────────────

function computeDiff(text1: string, text2: string): DiffLine[] {
  const lines1 = text1.split('\n')
  const lines2 = text2.split('\n')
  const result: DiffLine[] = []

  const lcs = computeLCS(lines1, lines2)
  let i = 0
  let j = 0
  let k = 0

  while (k < lcs.length) {
    const pair = lcs[k]!
    const li = pair[0]
    const lj = pair[1]

    while (i < li) {
      result.push({ type: 'removed', lineNum1: i + 1, text1: lines1[i]!, text2: '' })
      i++
    }
    while (j < lj) {
      result.push({ type: 'added', lineNum2: j + 1, text1: '', text2: lines2[j]! })
      j++
    }
    result.push({ type: 'same', lineNum1: i + 1, lineNum2: j + 1, text1: lines1[i]!, text2: lines2[j]! })
    i++
    j++
    k++
  }

  while (i < lines1.length) {
    result.push({ type: 'removed', lineNum1: i + 1, text1: lines1[i]!, text2: '' })
    i++
  }
  while (j < lines2.length) {
    result.push({ type: 'added', lineNum2: j + 1, text1: '', text2: lines2[j]! })
    j++
  }

  return result
}

function computeLCS(a: string[], b: string[]): Array<[number, number]> {
  const m = a.length
  const n = b.length

  // For very large files, use a greedy heuristic
  if (m * n > 10_000_000) {
    return computeLCSHeuristic(a, b)
  }

  // Standard DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[])

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  const result: Array<[number, number]> = []
  let ci = m
  let cj = n
  while (ci > 0 && cj > 0) {
    if (a[ci - 1] === b[cj - 1]) {
      result.push([ci - 1, cj - 1])
      ci--
      cj--
    } else if (dp[ci - 1]![cj]! > dp[ci]![cj - 1]!) {
      ci--
    } else {
      cj--
    }
  }

  return result.reverse()
}

function computeLCSHeuristic(a: string[], b: string[]): Array<[number, number]> {
  const bMap = new Map<string, number[]>()
  for (let j = 0; j < b.length; j++) {
    const key = b[j]!
    if (!bMap.has(key)) bMap.set(key, [])
    bMap.get(key)!.push(j)
  }

  const result: Array<[number, number]> = []
  let lastJ = -1
  for (let i = 0; i < a.length; i++) {
    const positions = bMap.get(a[i]!)
    if (!positions) continue
    const nextJ = positions.find(j => j > lastJ)
    if (nextJ !== undefined) {
      result.push([i, nextJ])
      lastJ = nextJ
    }
  }
  return result
}

// ─── Output Formats ─────────────────────────────────────────────────────────

function generateMarkdown(prompt: ExtractedPrompt): string {
  const parts: string[] = []
  parts.push('# System Prompt Extract')
  parts.push('')
  parts.push('- **Session**: ' + prompt.sessionId.slice(0, 8))
  if (prompt.model) parts.push('- **Model**: ' + prompt.model)
  if (prompt.version) parts.push('- **Version**: ' + prompt.version)
  if (prompt.timestamp) parts.push('- **Timestamp**: ' + prompt.timestamp)
  parts.push('- **Blocks**: ' + prompt.blocks.length)
  parts.push('')

  for (const block of prompt.blocks) {
    parts.push('## ' + block.label)
    if (block.cacheControl) parts.push('*Cache control: ' + block.cacheControl + '*')
    parts.push('')
    parts.push('```')
    parts.push(block.text)
    parts.push('```')
    parts.push('')
  }

  return parts.join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function generateDiffHTML(
  prompt1: ExtractedPrompt,
  prompt2: ExtractedPrompt,
  diffLines: DiffLine[],
): string {
  const stats = {
    same: diffLines.filter(d => d.type === 'same').length,
    added: diffLines.filter(d => d.type === 'added').length,
    removed: diffLines.filter(d => d.type === 'removed').length,
  }
  const total = stats.same + stats.added + stats.removed
  const similarity = total > 0 ? Math.round((stats.same / total) * 100) : 100
  const simColor = similarity > 80 ? '#4ade80' : similarity > 50 ? '#f59e0b' : '#ef4444'

  const diffRowsHTML = diffLines.map(d => {
    const cls = d.type
    const ln1 = d.lineNum1 ?? ''
    const ln2 = d.lineNum2 ?? ''
    const prefix = d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '
    const text = d.type === 'added' ? d.text2 : d.text1
    return '<tr class="' + cls + '" data-type="' + cls + '"><td class="ln">' + ln1 + '</td><td class="ln">' + ln2 + '</td><td class="code">' + prefix + ' ' + escapeHtml(text) + '</td></tr>'
  }).join('\n')

  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>System Prompt Diff</title>\n<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, monospace; background: #0d1117; color: #c9d1d9; }\n.header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; }\n.header h1 { font-size: 20px; color: #f0f6fc; margin-bottom: 8px; }\n.header .meta { display: flex; gap: 24px; font-size: 13px; color: #8b949e; flex-wrap: wrap; }\n.header .meta .col { display: flex; flex-direction: column; gap: 2px; }\n.header .meta .col-label { color: #484f58; text-transform: uppercase; font-size: 11px; }\n.stats { display: flex; gap: 12px; padding: 12px 24px; background: #0d1117; border-bottom: 1px solid #21262d; flex-wrap: wrap; align-items: center; }\n.stat { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 6px 12px; font-size: 13px; }\n.stat.similarity { font-weight: 700; font-size: 16px; color: ' + simColor + '; }\n.stat .added { color: #3fb950; }\n.stat .removed { color: #f85149; }\n.controls { padding: 8px 24px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; gap: 12px; font-size: 13px; }\n.controls label { color: #8b949e; cursor: pointer; }\n.controls input { margin-right: 4px; }\n.diff { padding: 16px 24px; overflow-x: auto; }\ntable { width: 100%; border-collapse: collapse; font-size: 13px; }\ntd { padding: 1px 8px; white-space: pre-wrap; word-break: break-word; vertical-align: top; border-bottom: 1px solid #21262d; }\ntd.ln { color: #484f58; text-align: right; width: 40px; user-select: none; font-size: 12px; }\ntd.code { font-family: \'SF Mono\', \'Fira Code\', monospace; }\ntr.same td.code { color: #8b949e; }\ntr.added td.code { background: #0d2818; color: #3fb950; }\ntr.removed td.code { background: #2d0f0f; color: #f85149; }\ntr.added td.ln { background: #0d2818; }\ntr.removed td.ln { background: #2d0f0f; }\n.hidden { display: none; }\ntd.separator { background: #161b22; text-align: center; color: #484f58; font-size: 12px; padding: 4px; }\n</style>\n</head>\n<body>\n<div class="header">\n<h1>System Prompt Diff</h1>\n<div class="meta">\n<div class="col"><span class="col-label">Left (removed)</span><span>' + escapeHtml(prompt1.sessionId.slice(0, 8)) + (prompt1.model ? ' | ' + escapeHtml(prompt1.model) : '') + (prompt1.version ? ' | v' + escapeHtml(prompt1.version) : '') + '</span></div>\n<div class="col"><span class="col-label">Right (added)</span><span>' + escapeHtml(prompt2.sessionId.slice(0, 8)) + (prompt2.model ? ' | ' + escapeHtml(prompt2.model) : '') + (prompt2.version ? ' | v' + escapeHtml(prompt2.version) : '') + '</span></div>\n</div>\n</div>\n<div class="stats">\n<div class="stat similarity">' + similarity + '% similar</div>\n<div class="stat"><span class="added">+' + stats.added + '</span> added</div>\n<div class="stat"><span class="removed">-' + stats.removed + '</span> removed</div>\n<div class="stat">' + stats.same + ' unchanged</div>\n<div class="stat">' + total + ' total lines</div>\n</div>\n<div class="controls">\n<label><input type="checkbox" id="hideUnchanged"> Hide unchanged lines</label>\n<label><input type="checkbox" id="collapseUnchanged" checked> Collapse long unchanged runs</label>\n</div>\n<div class="diff">\n<table id="diffTable">\n' + diffRowsHTML + '\n</table>\n</div>\n<script>\ndocument.getElementById(\'hideUnchanged\').addEventListener(\'change\', function() {\n  document.querySelectorAll(\'tr[data-type="same"]\').forEach(function(r) { r.classList.toggle(\'hidden\', this.checked); }.bind(this));\n  document.querySelectorAll(\'.collapse-row\').forEach(function(r) { r.classList.toggle(\'hidden\', this.checked); }.bind(this));\n});\ndocument.getElementById(\'collapseUnchanged\').addEventListener(\'change\', function() { collapseUnchangedRuns(this.checked); });\nfunction collapseUnchangedRuns(enable) {\n  document.querySelectorAll(\'.collapse-row\').forEach(function(r) { r.remove(); });\n  document.querySelectorAll(\'tr[data-type="same"]\').forEach(function(r) { r.classList.remove(\'hidden\'); });\n  if (!enable) return;\n  var rows = Array.from(document.querySelectorAll(\'#diffTable tr\'));\n  var runStart = -1, runLength = 0;\n  for (var i = 0; i <= rows.length; i++) {\n    var row = rows[i];\n    var isSame = row && row.getAttribute(\'data-type\') === \'same\';\n    if (isSame) { if (runStart === -1) runStart = i; runLength++; }\n    else { if (runLength > 6) { for (var j = runStart + 3; j < runStart + runLength - 3; j++) rows[j].classList.add(\'hidden\'); var cr = document.createElement(\'tr\'); cr.className = \'collapse-row\'; cr.innerHTML = \'<td colspan="3" class="separator">... \' + (runLength - 6) + \' unchanged lines ...</td>\'; rows[runStart + 3].before(cr); } runStart = -1; runLength = 0; }\n  }\n}\ncollapseUnchangedRuns(true);\n</script>\n</body>\n</html>'
}

function generateDiffMarkdown(
  prompt1: ExtractedPrompt,
  prompt2: ExtractedPrompt,
  diffLines: DiffLine[],
): string {
  const parts: string[] = []
  parts.push('# System Prompt Diff')
  parts.push('')
  parts.push('**Left**: Session ' + prompt1.sessionId.slice(0, 8) + (prompt1.model ? ' (' + prompt1.model + ')' : '') + (prompt1.version ? ' v' + prompt1.version : ''))
  parts.push('**Right**: Session ' + prompt2.sessionId.slice(0, 8) + (prompt2.model ? ' (' + prompt2.model + ')' : '') + (prompt2.version ? ' v' + prompt2.version : ''))
  parts.push('')

  const stats = {
    same: diffLines.filter(d => d.type === 'same').length,
    added: diffLines.filter(d => d.type === 'added').length,
    removed: diffLines.filter(d => d.type === 'removed').length,
  }
  const total = stats.same + stats.added + stats.removed
  parts.push('**Similarity**: ' + (total > 0 ? Math.round((stats.same / total) * 100) : 100) + '% | +' + stats.added + ' added | -' + stats.removed + ' removed')
  parts.push('')
  parts.push('```diff')

  for (const d of diffLines) {
    if (d.type === 'added') {
      parts.push('+ ' + d.text2)
    } else if (d.type === 'removed') {
      parts.push('- ' + d.text1)
    } else {
      parts.push('  ' + d.text1)
    }
  }

  parts.push('```')
  return parts.join('\n')
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    console.log('')
    console.log('  System Prompt Diff Tool')
    console.log('')
    console.log('  Commands:')
    console.log('    extract <session.jsonl> [-o prompt.md]')
    console.log('      Extract system prompt from a session transcript into Markdown.')
    console.log('')
    console.log('    diff <file1.md> <file2.md> [-o diff.html] [--md]')
    console.log('      Diff two extracted prompt files.')
    console.log('')
    console.log('    compare <session1.jsonl> <session2.jsonl> [-o diff.html] [--md]')
    console.log('      Extract and diff prompts from two sessions in one step.')
    console.log('')
    console.log('  Options:')
    console.log('    -o, --output    Output file path')
    console.log('    --md            Output as Markdown instead of HTML')
    console.log('')
    process.exit(0)
  }

  function getOpt(flag: string): string | undefined {
    const i = args.indexOf(flag)
    return i >= 0 && args[i + 1] ? args[i + 1] : undefined
  }
  const hasFlag = (flag: string): boolean => args.includes(flag)
  const outputPath = getOpt('-o') || getOpt('--output')
  const useMarkdown = hasFlag('--md')

  if (command === 'extract') {
    const inputPath = args[1]
    if (!inputPath) {
      console.error('Error: No input file specified')
      process.exit(1)
    }

    console.log('Extracting system prompt from: ' + inputPath)
    const prompt = extractSystemPrompt(inputPath)

    if (prompt.blocks.length === 0) {
      console.log('No system prompt blocks found in transcript.')
      console.log('(System prompts are typically constructed at runtime and sent')
      console.log(' directly to the API, not stored in the JSONL transcript.)')
      process.exit(0)
    }

    const md = generateMarkdown(prompt)
    const out = outputPath || join(dirname(inputPath), 'prompt-' + basename(inputPath, '.jsonl') + '.md')
    writeFileSync(out, md, 'utf-8')
    console.log('Extracted ' + prompt.blocks.length + ' blocks -> ' + out)

  } else if (command === 'diff') {
    const file1 = args[1]
    const file2 = args[2]
    if (!file1 || !file2) {
      console.error('Error: Two input files required')
      process.exit(1)
    }

    const text1 = readFileSync(file1, 'utf-8')
    const text2 = readFileSync(file2, 'utf-8')
    const prompt1: ExtractedPrompt = { sessionId: basename(file1), blocks: [], fullText: text1 }
    const prompt2: ExtractedPrompt = { sessionId: basename(file2), blocks: [], fullText: text2 }
    const diffLines = computeDiff(text1, text2)

    const out = outputPath || ('prompt-diff.' + (useMarkdown ? 'md' : 'html'))
    if (useMarkdown) {
      writeFileSync(out, generateDiffMarkdown(prompt1, prompt2, diffLines), 'utf-8')
    } else {
      writeFileSync(out, generateDiffHTML(prompt1, prompt2, diffLines), 'utf-8')
    }
    console.log('Diff generated -> ' + out)

  } else if (command === 'compare') {
    const session1 = args[1]
    const session2 = args[2]
    if (!session1 || !session2) {
      console.error('Error: Two session files required')
      process.exit(1)
    }

    console.log('Extracting prompts...')
    const prompt1 = extractSystemPrompt(session1)
    const prompt2 = extractSystemPrompt(session2)

    if (prompt1.blocks.length === 0 && prompt2.blocks.length === 0) {
      console.log('No system prompt blocks found in either transcript.')
      process.exit(0)
    }

    const diffLines = computeDiff(prompt1.fullText, prompt2.fullText)
    const stats = {
      same: diffLines.filter(d => d.type === 'same').length,
      added: diffLines.filter(d => d.type === 'added').length,
      removed: diffLines.filter(d => d.type === 'removed').length,
    }
    const total = stats.same + stats.added + stats.removed

    console.log('Session 1: ' + prompt1.blocks.length + ' blocks, ' + prompt1.fullText.split('\n').length + ' lines')
    console.log('Session 2: ' + prompt2.blocks.length + ' blocks, ' + prompt2.fullText.split('\n').length + ' lines')
    console.log('Similarity: ' + (total > 0 ? Math.round((stats.same / total) * 100) : 100) + '%')
    console.log('Changes: +' + stats.added + ' / -' + stats.removed)

    const defaultOut = 'prompt-diff-' + prompt1.sessionId.slice(0, 8) + '-vs-' + prompt2.sessionId.slice(0, 8) + '.' + (useMarkdown ? 'md' : 'html')
    const out = outputPath || defaultOut
    if (useMarkdown) {
      writeFileSync(out, generateDiffMarkdown(prompt1, prompt2, diffLines), 'utf-8')
    } else {
      writeFileSync(out, generateDiffHTML(prompt1, prompt2, diffLines), 'utf-8')
    }
    console.log('Diff generated -> ' + out)

  } else {
    console.error('Unknown command: ' + command)
    console.error('Run with --help for usage')
    process.exit(1)
  }
}

main()
