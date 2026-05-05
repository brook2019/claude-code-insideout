#!/usr/bin/env bash
# Log Analyzer for claude-code-insideout
# Analyzes debug logs to extract useful metrics and insights

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default log file location
if [[ "$(uname)" == "Darwin" ]] || [[ "$(uname)" == "Linux" ]]; then
  DEFAULT_LOG_FILE="$HOME/.claude/logs/debug.log"
elif [[ "$(uname)" == MINGW* ]] || [[ "$(uname)" == MSYS* ]]; then
  DEFAULT_LOG_FILE="$USERPROFILE/.claude/logs/debug.log"
else
  DEFAULT_LOG_FILE="$HOME/.claude/logs/debug.log"
fi

LOG_FILE="${1:-$DEFAULT_LOG_FILE}"

# Check if log file exists
if [[ ! -f "$LOG_FILE" ]]; then
  echo -e "${RED}Error: Log file not found: $LOG_FILE${NC}"
  echo ""
  echo "Usage: $0 [log-file-path]"
  echo ""
  echo "Default log locations:"
  echo "  Linux/macOS: ~/.claude/logs/debug.log"
  echo "  Windows: %USERPROFILE%\\.claude\\logs\\debug.log"
  exit 1
fi

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Claude Code Inside Out - Log Analyzer${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Analyzing:${NC} $LOG_FILE"
echo -e "${BLUE}File size:${NC} $(du -h "$LOG_FILE" | cut -f1)"
echo -e "${BLUE}Last modified:${NC} $(ls -lh "$LOG_FILE" | awk '{print $6, $7, $8}')"
echo ""

# Extract log statistics
TOTAL_LINES=$(wc -l < "$LOG_FILE")
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📊 GENERAL STATISTICS${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Total log entries: ${YELLOW}$TOTAL_LINES${NC}"

# Count by log level
TRACE_COUNT=$(grep -c "\[TRACE\]" "$LOG_FILE" 2>/dev/null || echo "0")
DEBUG_COUNT=$(grep -c "\[DEBUG\]" "$LOG_FILE" 2>/dev/null || echo "0")
INFO_COUNT=$(grep -c "\[INFO\]" "$LOG_FILE" 2>/dev/null || echo "0")
WARN_COUNT=$(grep -c "\[WARN\]" "$LOG_FILE" 2>/dev/null || echo "0")
ERROR_COUNT=$(grep -c "\[ERROR\]" "$LOG_FILE" 2>/dev/null || echo "0")

echo ""
echo -e "${GREEN}Log Levels:${NC}"
echo -e "  TRACE: ${CYAN}$TRACE_COUNT${NC}"
echo -e "  DEBUG: ${CYAN}$DEBUG_COUNT${NC}"
echo -e "  INFO:  ${CYAN}$INFO_COUNT${NC}"
echo -e "  WARN:  ${YELLOW}$WARN_COUNT${NC}"
echo -e "  ERROR: ${RED}$ERROR_COUNT${NC}"

# Count by component
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🔧 COMPONENT ACTIVITY${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

for component in INPUT PROCESS_INPUT PROMPT REPL QUERY LLM CLIENT AUTH FETCH; do
  count=$(grep -c "\[$component\]" "$LOG_FILE" 2>/dev/null || echo "0")
  if [[ "$count" -gt 0 ]] 2>/dev/null; then
    printf "  %-15s ${CYAN}%6d${NC} entries\n" "$component:" "$count"
  fi
done

# API Request Analysis
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🌐 API REQUEST ANALYSIS${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

API_REQUESTS=$(grep -c "API Request - model:" "$LOG_FILE" 2>/dev/null || echo "0")
echo -e "  Total API requests: ${YELLOW}$API_REQUESTS${NC}"

if [[ "$API_REQUESTS" -gt 0 ]] 2>/dev/null; then
  echo ""
  echo -e "${GREEN}Models used:${NC}"
  grep "API Request - model:" "$LOG_FILE" | \
    sed -E 's/.*model: ([^,]+).*/\1/' | \
    sort | uniq -c | sort -rn | \
    awk '{printf "  %-40s %s requests\n", $2, $1}'

  echo ""
  echo -e "${GREEN}Token statistics:${NC}"

  # Extract max_tokens values
  MAX_TOKENS=$(grep "API Request - model:" "$LOG_FILE" | \
    sed -E 's/.*max_tokens: ([0-9]+).*/\1/' | \
    awk '{sum+=$1; count++} END {if(count>0) printf "%.0f", sum/count; else print "0"}')
  echo -e "  Average max_tokens: ${CYAN}$MAX_TOKENS${NC}"

  # Count tool usage
  TOOLS_COUNT=$(grep "tools.length:" "$LOG_FILE" | \
    sed -E 's/.*tools.length: ([0-9]+).*/\1/' | \
    awk '{sum+=$1; count++} END {if(count>0) printf "%.1f", sum/count; else print "0"}')
  echo -e "  Average tools available: ${CYAN}$TOOLS_COUNT${NC}"
fi

# Query Analysis
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🔍 QUERY ANALYSIS${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

QUERIES_STARTED=$(grep -c "query() called" "$LOG_FILE" 2>/dev/null || echo "0")
QUERIES_COMPLETED=$(grep -c "Query completed" "$LOG_FILE" 2>/dev/null || echo "0")
QUERIES_FAILED=$(grep -c "Query error" "$LOG_FILE" 2>/dev/null || echo "0")

echo -e "  Queries started:   ${CYAN}$QUERIES_STARTED${NC}"
echo -e "  Queries completed: ${GREEN}$QUERIES_COMPLETED${NC}"
echo -e "  Queries failed:    ${RED}$QUERIES_FAILED${NC}"

# Stop reasons
echo ""
echo -e "${GREEN}Stop reasons:${NC}"
grep "stop_reason:" "$LOG_FILE" | \
  sed -E 's/.*stop_reason: ([^,]+).*/\1/' | \
  grep -v "none" | \
  sort | uniq -c | sort -rn | \
  awk '{printf "  %-20s %s occurrences\n", $2, $1}'

# Tool Usage Analysis
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🛠️  TOOL USAGE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

TOOL_USES=$(grep -c "Tool use blocks found:" "$LOG_FILE" 2>/dev/null || echo "0")
echo -e "  Total tool invocations: ${YELLOW}$TOOL_USES${NC}"

if [[ "$TOOL_USES" -gt 0 ]] 2>/dev/null; then
  echo ""
  echo -e "${GREEN}Most used tools:${NC}"
  grep "Tool use blocks found:" "$LOG_FILE" | \
    sed -E 's/.*Tool use blocks found: //' | \
    tr ',' '\n' | \
    sed 's/^ *//' | \
    sort | uniq -c | sort -rn | head -10 | \
    awk '{printf "  %-20s %s times\n", $2, $1}'
fi

# Authentication Analysis
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🔐 AUTHENTICATION${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

AUTH_CHECKS=$(grep -c "\[AUTH\]" "$LOG_FILE" 2>/dev/null || echo "0")
echo -e "  Auth operations: ${CYAN}$AUTH_CHECKS${NC}"

if [[ "$AUTH_CHECKS" -gt 0 ]] 2>/dev/null; then
  echo ""
  echo -e "${GREEN}Auth methods used:${NC}"

  if grep -q "Using AWS_BEARER_TOKEN_BEDROCK" "$LOG_FILE"; then
    echo -e "  ${CYAN}✓${NC} AWS Bedrock Bearer Token"
  fi
  if grep -q "Using ANTHROPIC_AUTH_TOKEN" "$LOG_FILE"; then
    echo -e "  ${CYAN}✓${NC} Anthropic Auth Token (Bearer)"
  fi
  if grep -q "Using AWS credentials" "$LOG_FILE"; then
    echo -e "  ${CYAN}✓${NC} AWS IAM Credentials"
  fi
  if grep -q "OAuth token check" "$LOG_FILE"; then
    echo -e "  ${CYAN}✓${NC} OAuth Token"
  fi
fi

# Error Analysis
if [[ "$ERROR_COUNT" -gt 0 ]] 2>/dev/null; then
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ ERROR ANALYSIS${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  echo -e "  Total errors: ${RED}$ERROR_COUNT${NC}"
  echo ""
  echo -e "${RED}Recent errors (last 5):${NC}"
  grep "\[ERROR\]" "$LOG_FILE" | tail -5 | while IFS= read -r line; do
    timestamp=$(echo "$line" | sed -E 's/\[([^\]]+)\].*/\1/')
    component=$(echo "$line" | sed -E 's/.*\[ERROR\] \[([^\]]+)\].*/\1/')
    message=$(echo "$line" | sed -E 's/.*\[ERROR\] \[[^\]]+\] //')
    echo -e "  ${YELLOW}$timestamp${NC} ${MAGENTA}[$component]${NC}"
    echo -e "    ${RED}$message${NC}" | head -c 100
    echo ""
  done
fi

# Time Range
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}⏰ TIME RANGE${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

FIRST_LOG=$(head -1 "$LOG_FILE" | sed -E 's/\[([^\]]+)\].*/\1/')
LAST_LOG=$(tail -1 "$LOG_FILE" | sed -E 's/\[([^\]]+)\].*/\1/')

echo -e "  First log entry: ${CYAN}$FIRST_LOG${NC}"
echo -e "  Last log entry:  ${CYAN}$LAST_LOG${NC}"

# Summary
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📝 SUMMARY${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ "$ERROR_COUNT" -eq 0 ]] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} No errors found - system running smoothly"
else
  echo -e "  ${YELLOW}!${NC} Found $ERROR_COUNT errors - review recommended"
fi

if [[ "$QUERIES_COMPLETED" -gt 0 && "$QUERIES_FAILED" -eq 0 ]] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} All queries completed successfully"
elif [[ "$QUERIES_FAILED" -gt 0 ]] 2>/dev/null; then
  success_rate=$(echo "scale=1; ($QUERIES_COMPLETED * 100) / ($QUERIES_COMPLETED + $QUERIES_FAILED)" | bc 2>/dev/null || echo "0")
  echo -e "  ${YELLOW}!${NC} Query success rate: ${success_rate}%"
fi

if [[ "$API_REQUESTS" -gt 0 ]] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} Made $API_REQUESTS API requests"
fi

if [[ "$TOOL_USES" -gt 0 ]] 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} Executed $TOOL_USES tool invocations"
fi

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}💡 Tips:${NC}"
echo -e "  • View real-time logs: ${CYAN}tail -f $LOG_FILE${NC}"
echo -e "  • Filter by component: ${CYAN}grep '\[LLM\]' $LOG_FILE${NC}"
echo -e "  • Show only errors: ${CYAN}grep '\[ERROR\]' $LOG_FILE${NC}"
echo -e "  • Count queries: ${CYAN}grep -c 'query() called' $LOG_FILE${NC}"
echo ""
