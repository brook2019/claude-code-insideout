# Changes Made to Fix Salesforce Bedrock Gateway Authentication

## Summary
Fixed claude-code-insideout to work with Salesforce's internal Bedrock gateway instead of standard Anthropic API.

## Problem
- DNS could not resolve `api.anthropic.com` (network restriction)
- Needed to use custom internal Bedrock gateway
- Gateway requires `x-api-key` header, not `Authorization: Bearer`

## Changes Made

### 1. **bin/claude-code-insideout** - Startup Script
**Added:**
```bash
# Configure for custom Bedrock gateway
export CLAUDE_CODE_USE_BEDROCK=1
export CLAUDE_CODE_SKIP_BEDROCK_AUTH=1
export ANTHROPIC_BEDROCK_BASE_URL=https://your-gateway-url/bedrock
```

**Purpose:** Force Bedrock mode and set custom gateway URL before app starts

---

### 2. **src/services/api/client.ts** - Main API Client

**Change 1: Add baseURL support for Bedrock** (Line ~172-175)
```typescript
const bedrockArgs: ConstructorParameters<typeof AnthropicBedrock>[0] = {
  ...ARGS,
  awsRegion,
  ...(isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH) && {
    skipAuth: true,
  }),
  ...(isDebugToStdErr() && { logger: createStderrLogger() }),
  // ✅ NEW: Add baseURL if provided
  ...(process.env.ANTHROPIC_BEDROCK_BASE_URL && {
    baseURL: process.env.ANTHROPIC_BEDROCK_BASE_URL,
  }),
}
```

**Change 2: Use x-api-key header instead of Authorization** (Line ~188-198)
```typescript
// OLD:
bedrockArgs.defaultHeaders = {
  ...bedrockArgs.defaultHeaders,
  Authorization: `Bearer ${process.env.ANTHROPIC_AUTH_TOKEN}`,
}

// NEW:
bedrockArgs.defaultHeaders = {
  ...bedrockArgs.defaultHeaders,
  'x-api-key': process.env.ANTHROPIC_AUTH_TOKEN,
}
```

**Change 3: Fix logger import in buildFetch** (Line ~398)
```typescript
return async (input, init) => {
  const { appendFileSync } = await import('node:fs')
  // ✅ NEW: Import logger dynamically
  const { logger } = await import('../../utils/logger.js')
  // ... rest of function
}
```

**Change 4: Add debug logging** (Line ~157)
```typescript
if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) {
  // ✅ NEW: Debug output to verify configuration
  console.log('[DEBUG] Entering BEDROCK path with baseURL:', process.env.ANTHROPIC_BEDROCK_BASE_URL)
  logger.trace('CLIENT', `Entering BEDROCK path...`)
}
```

---

### 3. **src/utils/logger.ts** - Logger Debugging

**Change: Add verbose error logging**
```typescript
// OLD:
if (process.env.CLAUDE_CODE_VERBOSE_LOGGING === '1') {
  console.error(`[Logger] Failed to write log: ${error}`)
}

// NEW:
// Always show errors for debugging
console.error(`[Logger] Failed to write log: ${error}`)
```

**Change: Add skip logging debug**
```typescript
if (!loggingEnabled || !logFilePath) {
  // ✅ NEW: Debug why logging is skipped
  console.log(`[Logger] Skipping log - enabled: ${loggingEnabled}, path: ${logFilePath}`)
  return
}
```

---

### 4. **.env** - Environment Configuration

**Content:**
```env
# Bedrock Configuration (optional)
# For custom Bedrock gateway, configure in bin/claude-code-insideout

# API Authentication
export ANTHROPIC_AUTH_TOKEN=your-token-here
# OR
export ANTHROPIC_API_KEY=your-api-key-here

# Model names will be automatically converted to Bedrock format:
# claude-sonnet-4.5 → us.anthropic.claude-sonnet-4-5-20250929-v1:0
# claude-haiku-4.5 → us.anthropic.claude-haiku-4-5-20251001-v1:0

# Timeout
API_TIMEOUT_MS=600000

# Disable telemetry
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

# Debug Logging
CLAUDE_CODE_DEBUG_ENABLED=1
CLAUDE_CODE_DEBUG_LOG=~/.claude/logs/debug.log
```

---

## Testing

Created **test-full.js** to verify the fix works:
```javascript
#!/usr/bin/env bun

// Set environment variables
process.env.CLAUDE_CODE_USE_BEDROCK = '1'
process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH = '1'
process.env.ANTHROPIC_BEDROCK_BASE_URL = 'https://your-gateway-url/bedrock'
process.env.ANTHROPIC_AUTH_TOKEN = 'your-token-here'

// Enable configs (required)
const { enableConfigs } = await import('./src/utils/config.ts')
enableConfigs()

// Get client and test
const { getAnthropicClient } = await import('./src/services/api/client.ts')
const client = await getAnthropicClient({
  model: 'claude-haiku-4.5',
  isNonInteractiveSession: true
})

const response = await client.messages.create({
  model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  max_tokens: 50,
  messages: [{ role: 'user', content: 'Say hello' }],
})

console.log('Response:', response.content[0].text)
```

**Test result:** ✅ SUCCESS!

---

## Key Learnings

1. **Custom Bedrock gateways may require `x-api-key` header**, not `Authorization: Bearer`
2. **AnthropicBedrock SDK requires `baseURL` parameter** to use custom endpoints
3. **Logger must be imported dynamically** in async functions to avoid scope issues
4. **Config must be enabled** via `enableConfigs()` before using the client

---

## Usage

```bash
# Interactive mode
./bin/claude-code-insideout

# Headless mode  
./bin/claude-code-insideout -p "your prompt here"
```

The app now successfully connects to the Salesforce Bedrock gateway!
