#!/usr/bin/env bash
# Extract LLM request/response data from debug.log

set -euo pipefail

LOG_FILE="${1:-$HOME/.claude/logs/debug.log}"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "Error: Log file not found: $LOG_FILE"
  exit 1
fi

echo "════════════════════════════════════════"
echo "LLM Request/Response Extractor"
echo "════════════════════════════════════════"
echo ""

# Function to extract and format JSON
extract_request() {
  echo "📤 REQUEST TO LLM"
  echo "─────────────────"
  grep "\[LLM\] Send request to LLM:" "$LOG_FILE" | tail -1 | \
    sed 's/.*Send request to LLM: //' | \
    jq -C '.' 2>/dev/null || echo "No request found or invalid JSON"
  echo ""
}

# Function to extract response metadata
extract_response_metadata() {
  echo "📥 RESPONSE FROM LLM (Metadata)"
  echo "─────────────────"

  # Extract message_start with usage info
  grep "\[LLM\] message_start received" "$LOG_FILE" | tail -1 || echo "No response found"
  grep "\[LLM\] message_start usage" "$LOG_FILE" | tail -1 || echo "No usage info found"

  echo ""
}

# Function to extract text content
extract_text_response() {
  echo "📝 RESPONSE TEXT CONTENT"
  echo "─────────────────"

  # Extract all text deltas (the actual response text)
  grep "\[LLM\] Received text delta:" "$LOG_FILE" | tail -20 | \
    sed 's/.*Received text delta: //' | \
    tr -d '\n'

  echo -e "\n"
}

# Function to extract thinking content
extract_thinking() {
  echo "🧠 THINKING BLOCKS"
  echo "─────────────────"

  grep "\[LLM\] thinking block" "$LOG_FILE" | tail -5 || echo "No thinking blocks found"

  echo ""
}

# Function to extract token usage
extract_token_usage() {
  echo "📊 TOKEN USAGE"
  echo "─────────────────"

  # Get the most recent usage stats
  grep "message_start usage" "$LOG_FILE" | tail -1 | \
    sed 's/.*usage - //' || echo "No usage stats found"

  echo ""
}

# Function to extract model info
extract_model_info() {
  echo "🤖 MODEL INFORMATION"
  echo "─────────────────"

  # Extract model from request
  grep "\[LLM\] Send request to LLM:" "$LOG_FILE" | tail -1 | \
    sed 's/.*Send request to LLM: //' | \
    jq -r '.model' 2>/dev/null || echo "Model not found"

  echo ""
}

# Function to extract system prompt
extract_system_prompt() {
  echo "📋 SYSTEM PROMPT"
  echo "─────────────────"

  grep "\[LLM\] Send request to LLM:" "$LOG_FILE" | tail -1 | \
    sed 's/.*Send request to LLM: //' | \
    jq -r '.system[]?.text' 2>/dev/null | head -50 || echo "System prompt not found"

  echo ""
}

# Function to extract user messages
extract_user_messages() {
  echo "💬 USER MESSAGES"
  echo "─────────────────"

  grep "\[LLM\] Send request to LLM:" "$LOG_FILE" | tail -1 | \
    sed 's/.*Send request to LLM: //' | \
    jq -r '.messages[] | select(.role == "user") | .content' 2>/dev/null || echo "User messages not found"

  echo ""
}

# Function to extract tool information
extract_tools() {
  echo "🛠️  AVAILABLE TOOLS"
  echo "─────────────────"

  grep "\[LLM\] Send request to LLM:" "$LOG_FILE" | tail -1 | \
    sed 's/.*Send request to LLM: //' | \
    jq -r '.tools[]?.name' 2>/dev/null || echo "No tools found"

  echo ""
}

# Main menu
case "${2:-all}" in
  request)
    extract_request
    ;;
  response)
    extract_response_metadata
    extract_text_response
    ;;
  tokens)
    extract_token_usage
    ;;
  model)
    extract_model_info
    ;;
  system)
    extract_system_prompt
    ;;
  messages)
    extract_user_messages
    ;;
  tools)
    extract_tools
    ;;
  thinking)
    extract_thinking
    ;;
  all)
    extract_model_info
    extract_token_usage
    extract_tools
    echo ""
    extract_user_messages
    extract_response_metadata
    extract_text_response
    ;;
  *)
    echo "Usage: $0 [log_file] [command]"
    echo ""
    echo "Commands:"
    echo "  all       - Show summary (default)"
    echo "  request   - Show full request JSON"
    echo "  response  - Show response text"
    echo "  tokens    - Show token usage"
    echo "  model     - Show model name"
    echo "  system    - Show system prompt"
    echo "  messages  - Show user messages"
    echo "  tools     - Show available tools"
    echo "  thinking  - Show thinking blocks"
    echo ""
    echo "Examples:"
    echo "  $0                          # Show summary from default log"
    echo "  $0 debug.log request        # Show full request JSON"
    echo "  $0 debug.log tokens         # Show only token usage"
    ;;
esac
