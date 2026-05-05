# API Message Format Conversion: Client → Bedrock → Claude

## Your Question

> Does it only invoke `/v1/messages`? And does Bedrock interpret the message and convert it to a message format for Claude?

**Answer:** It depends on which endpoint you're using! There are actually **two different paths**:

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Claude Code Client                           │
│  Uses: @anthropic-ai/bedrock-sdk (AnthropicBedrock class)          │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
                        ↓
        ┌───────────────────────────────┐
        │   Which endpoint to use?      │
        └───────────┬───────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
        ↓                        ↓
┌──────────────────┐    ┌──────────────────────┐
│  Direct Anthropic│    │  AWS Bedrock Path    │
│  (Standard)      │    │  (Salesforce uses)   │
└──────────────────┘    └──────────────────────┘
        │                        │
        ↓                        ↓
  api.anthropic.com     AWS Bedrock Runtime API
  /v1/messages          /model/us.anthropic.*/invoke
        │                        │
        ↓                        ↓
  ┌─────────────┐         ┌──────────────┐
  │   Claude    │         │ AWS Bedrock  │
  │   Model     │         │   Service    │
  └─────────────┘         └──────┬───────┘
                                 │
                                 ↓
                          ┌──────────────┐
                          │   Claude     │
                          │   Model      │
                          └──────────────┘
```

---

## Path 1: Direct Anthropic API (Standard)

### Endpoint
```
POST https://api.anthropic.com/v1/messages
```

### Message Format
**Native Anthropic format** - No conversion needed!

```json
{
  "model": "claude-sonnet-4.5",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1024
}
```

### Flow
```
Client SDK → /v1/messages → Claude Model
              (no conversion - direct Anthropic format)
```

---

## Path 2: AWS Bedrock Path (What Salesforce Uses)

### Endpoint
```
POST https://bedrock-runtime.us-east-1.amazonaws.com/model/us.anthropic.claude-sonnet-4-5-20250929-v1:0/invoke
```

**BUT** when using a custom gateway (Salesforce):
```
POST https://your-gateway-url/bedrock/model/us.anthropic.*/invoke
```

### Message Format Conversion

The `@anthropic-ai/bedrock-sdk` **converts** Anthropic format → Bedrock format:

#### Client sends (Anthropic format):
```json
{
  "model": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1024
}
```

#### SDK converts to (Bedrock format):
```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1024
}
```

**Note:** Model ID is in the **URL path**, not the body!

### Response Conversion

#### Bedrock returns:
```json
{
  "id": "msg_bdrk_...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello!"}],
  "model": "claude-sonnet-4-5-20250929",
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 20}
}
```

#### SDK converts back to Anthropic format:
```json
{
  "id": "msg_bdrk_...",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello!"}],
  "model": "claude-sonnet-4-5-20250929",
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 10, "output_tokens": 20}
}
```

**In this case, the formats are very similar, but the SDK handles differences!**

---

## What the `@anthropic-ai/bedrock-sdk` Does

```javascript
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'

const client = new AnthropicBedrock({
  awsRegion: 'us-east-1',
  baseURL: 'https://your-gateway/bedrock', // Optional custom gateway
  skipAuth: true,  // Skip AWS IAM if gateway handles auth
  defaultHeaders: {
    'x-api-key': 'your-token'  // Custom auth for gateway
  }
})

// You call it with Anthropic format:
const response = await client.messages.create({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  messages: [{role: 'user', content: 'Hello'}],
  max_tokens: 1024
})

// Internally, the SDK:
// 1. Extracts model ID from model name
// 2. Converts request to Bedrock format
// 3. POSTs to: /model/{modelId}/invoke
// 4. Converts response back to Anthropic format
// 5. Returns standard Anthropic response
```

---

## Key Differences: Anthropic vs Bedrock API

| Aspect | Anthropic API | AWS Bedrock API |
|--------|--------------|-----------------|
| **Endpoint** | `/v1/messages` | `/model/{modelId}/invoke` |
| **Model in** | Request body | URL path |
| **Auth** | `x-api-key` header | AWS Signature V4 (IAM) |
| **Format** | Native Anthropic | Bedrock-wrapped |
| **Response** | SSE stream | SSE stream (similar) |
| **SDK conversion** | ❌ No conversion | ✅ SDK converts both ways |

---

## Salesforce Gateway Architecture

```
┌───────────────────────┐
│  Claude Code Client   │
│  (AnthropicBedrock)   │
└───────────┬───────────┘
            │ Anthropic format
            │ POST /bedrock/model/us.anthropic.*/invoke
            │ x-api-key: sk-xxx...
            ↓
┌─────────────────────────────────────────────────┐
│  Salesforce Gateway                             │
│  https://eng-ai-model-gateway.sfproxy...        │
│                                                 │
│  1. Validates x-api-key (Salesforce token)     │
│  2. Converts to AWS IAM credentials            │
│  3. Forwards to real AWS Bedrock               │
└───────────┬─────────────────────────────────────┘
            │ AWS IAM signature
            │ POST /model/us.anthropic.*/invoke
            ↓
┌───────────────────────────────────────────────┐
│  AWS Bedrock Runtime API                      │
│  https://bedrock-runtime.us-east-1.amazonaws  │
│                                               │
│  1. Validates AWS credentials                 │
│  2. Routes to Claude model                    │
└───────────┬───────────────────────────────────┘
            │ Bedrock format
            ↓
┌───────────────────────┐
│  Claude Model         │
│  (Anthropic's LLM)    │
└───────────┬───────────┘
            │ Response
            ↓
    (flows back up the chain)
```

---

## So Who Does the Conversion?

| Layer | Conversion Happens? | What it Does |
|-------|-------------------|--------------|
| **Client SDK** | ✅ YES | Anthropic format → Bedrock format |
| **Salesforce Gateway** | ❌ NO | Just auth proxy (x-api-key → AWS IAM) |
| **AWS Bedrock** | ❌ NO | Routes to model (no format change) |
| **Claude Model** | ❌ NO | Processes native Claude format |
| **Response** | ✅ YES | SDK converts Bedrock response → Anthropic |

---

## Code Evidence

### 1. SDK Import
```typescript
// From src/services/api/client.ts:159
const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk')
```

### 2. Client Creation with Custom URL
```typescript
// From src/services/api/client.ts:167-176
const bedrockArgs = {
  ...ARGS,
  awsRegion: 'us-east-1',
  skipAuth: true,  // Don't use AWS IAM
  baseURL: process.env.ANTHROPIC_BEDROCK_BASE_URL,  // Custom gateway!
  defaultHeaders: {
    'x-api-key': process.env.ANTHROPIC_AUTH_TOKEN   // Custom auth
  }
}

return new AnthropicBedrock(bedrockArgs)
```

### 3. SDK Usage (Same API as Anthropic)
```typescript
// From src/services/api/claude.ts
const response = await anthropic.messages.create({
  model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  messages: [...],
  stream: true
})
```

The SDK handles all conversions transparently!

---

## Answer Summary

**Q: Does it only invoke `/v1/messages`?**
- **Standard path:** Yes, uses `/v1/messages` on `api.anthropic.com`
- **Bedrock path (Salesforce):** No, uses `/model/{modelId}/invoke` on Bedrock endpoint

**Q: Does Bedrock interpret the message and convert it?**
- **No!** The `@anthropic-ai/bedrock-sdk` in the **client** does the conversion
- Bedrock just routes the request to Claude
- Salesforce gateway doesn't convert - it's just an auth proxy

**Conversion happens in:**
1. ✅ **Client SDK** (`@anthropic-ai/bedrock-sdk`) - Converts formats
2. ❌ **Salesforce Gateway** - Only proxies and changes auth
3. ❌ **AWS Bedrock** - Only routes to model
4. ❌ **Claude Model** - Processes native format

The SDK provides a **uniform Anthropic API** regardless of whether you're using Anthropic directly or AWS Bedrock!

---

## Verification from Logs

Let's check what URL is actually being called:

```bash
grep "FETCH.*request" ~/.claude/logs/debug.log | tail -1
```

Unfortunately, the logs show headers but not the exact URL path. However, we know from the code:

1. ✅ `baseURL` is set to Salesforce gateway
2. ✅ SDK uses `/model/{modelId}/invoke` pattern for Bedrock
3. ✅ Model ID comes from the model name parameter

So the actual endpoint is:
```
POST https://your-gateway-url/bedrock/model/us.anthropic.claude-sonnet-4-5-20250929-v1:0/invoke
```

**Not** `/v1/messages` when using Bedrock!
