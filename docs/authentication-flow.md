# Authentication Flow Diagrams

This document shows detailed sequence diagrams for all authentication methods supported by Claude Code.

## Table of Contents

- [Authentication Decision Flow](#authentication-decision-flow)
- [Method 1: OAuth Token (Claude.ai)](#method-1-oauth-token-claudeai)
- [Method 2: API Key (x-api-key)](#method-2-api-key-x-api-key)
- [Method 3: Bearer Token](#method-3-bearer-token)
- [Method 4: AWS Bedrock](#method-4-aws-bedrock)
- [Method 5: GCP Vertex AI](#method-5-gcp-vertex-ai)
- [Method 6: Azure Foundry](#method-6-azure-foundry)

---

## Authentication Decision Flow

This diagram shows how Claude Code decides which authentication method to use.

```mermaid
graph TD
    Start([Client Initialization]) --> CheckSubscriber{Is Claude.ai<br/>Subscriber?}
    
    CheckSubscriber -->|YES| OAuthFlow[Use OAuth Token]
    OAuthFlow --> CheckRefresh[Check Token Expiry]
    CheckRefresh --> RefreshIfNeeded[Refresh if Needed]
    RefreshIfNeeded --> UseOAuth[authToken: access_token]
    UseOAuth --> CreateClient[Create Anthropic Client]
    
    CheckSubscriber -->|NO| CheckPlatform{Using 3rd Party<br/>Platform?}
    
    CheckPlatform -->|Bedrock| BedrockFlow[AWS Bedrock Path]
    BedrockFlow --> CheckBedrockToken{Has AWS_BEARER_TOKEN<br/>_BEDROCK?}
    CheckBedrockToken -->|YES| UseBedrockToken[Bearer Token Auth]
    CheckBedrockToken -->|NO| CheckAuthToken{Has ANTHROPIC<br/>_AUTH_TOKEN?}
    CheckAuthToken -->|YES| UseAuthTokenBedrock[Bearer Token Fallback]
    CheckAuthToken -->|NO| UseAWSCreds[AWS IAM Credentials]
    UseBedrockToken --> CreateBedrockClient[Create Bedrock Client]
    UseAuthTokenBedrock --> CreateBedrockClient
    UseAWSCreds --> RefreshAWS[Refresh AWS Credentials]
    RefreshAWS --> CreateBedrockClient
    
    CheckPlatform -->|Vertex| VertexFlow[GCP Vertex AI Path]
    VertexFlow --> CheckVertexSkip{Skip Vertex<br/>Auth?}
    CheckVertexSkip -->|YES| MockGoogleAuth[Mock GoogleAuth]
    CheckVertexSkip -->|NO| UseGoogleAuth[Use GoogleAuth]
    UseGoogleAuth --> RefreshGCP[Refresh GCP Credentials]
    RefreshGCP --> CreateVertexClient[Create Vertex Client]
    MockGoogleAuth --> CreateVertexClient
    
    CheckPlatform -->|Foundry| FoundryFlow[Azure Foundry Path]
    FoundryFlow --> CheckFoundryKey{Has FOUNDRY<br/>_API_KEY?}
    CheckFoundryKey -->|YES| UseFoundryKey[Use API Key]
    CheckFoundryKey -->|NO| UseAzureAD[Azure AD Token Provider]
    UseAzureAD --> GetAzureToken[Get Bearer Token]
    GetAzureToken --> CreateFoundryClient[Create Foundry Client]
    UseFoundryKey --> CreateFoundryClient
    
    CheckPlatform -->|Direct API| DirectFlow[Direct Anthropic API]
    DirectFlow --> CheckAuthToken2{Has ANTHROPIC<br/>_AUTH_TOKEN?}
    CheckAuthToken2 -->|YES| ConfigBearer[Configure Bearer Header]
    CheckAuthToken2 -->|NO| CheckAPIKey{Has ANTHROPIC<br/>_API_KEY?}
    CheckAPIKey -->|YES| UseAPIKey[Use API Key]
    CheckAPIKey -->|NO| CheckHelper{Has API Key<br/>Helper?}
    CheckHelper -->|YES| GetFromHelper[Get Key from Helper]
    CheckHelper -->|NO| AuthFail[Authentication Failed]
    
    ConfigBearer --> CreateClient
    UseAPIKey --> CreateClient
    GetFromHelper --> CreateClient
    CreateBedrockClient --> Success[Client Ready]
    CreateVertexClient --> Success
    CreateFoundryClient --> Success
    CreateClient --> Success
    AuthFail --> Error[Error: No Auth]
    
    style Start fill:#e1f5ff
    style Success fill:#c8e6c9
    style Error fill:#ffcdd2
    style OAuthFlow fill:#fff9c4
    style BedrockFlow fill:#ffe0b2
    style VertexFlow fill:#f8bbd0
    style FoundryFlow fill:#d1c4e9
    style DirectFlow fill:#c5cae9
```

---

## Method 1: OAuth Token (Claude.ai)

For users with Claude.ai subscriptions.

```mermaid
sequenceDiagram
    participant App as Application
    participant Client as API Client
    participant Auth as Auth Service
    participant Storage as Token Storage
    participant API as Anthropic API

    App->>Client: getAnthropicClient()
    Note over Client: Check if user is subscriber
    
    Client->>Auth: isClaudeAISubscriber()
    Auth-->>Client: true
    
    Client->>Auth: checkAndRefreshOAuthTokenIfNeeded()
    Note over Auth: OAuth token management
    
    Auth->>Storage: Get stored tokens
    Storage-->>Auth: {accessToken, refreshToken, expiresAt}
    
    Auth->>Auth: Check if token expired
    
    alt Token Expired
        Auth->>API: POST /oauth/token (refresh)
        Note over API: Use refresh_token
        API-->>Auth: {new_access_token, new_refresh_token}
        Auth->>Storage: Save new tokens
        Storage-->>Auth: Saved
    else Token Valid
        Note over Auth: No refresh needed
    end
    
    Auth-->>Client: Token ready
    
    Client->>Client: Create Anthropic client
    Note over Client: authToken: accessToken
    
    Client-->>App: Anthropic client instance
    
    Note over App: Client ready with OAuth
    
    App->>API: API Request
    Note over API: Authorization: Bearer {accessToken}
    API-->>App: Response
```

**Key Points:**
- Automatic token refresh
- Tokens stored securely
- No manual API key needed
- Requires Claude.ai subscription

**Environment Variables:**
- None (uses stored tokens)

**Log Output:**
```log
[AUTH] OAuth token check starting
[AUTH] Token expires in 3600 seconds, no refresh needed
[AUTH] OAuth token check complete
[CLIENT] Creating client with OAuth token
```

---

## Method 2: API Key (x-api-key)

Standard Anthropic API key authentication.

```mermaid
sequenceDiagram
    participant App as Application
    participant Client as API Client
    participant Env as Environment
    participant API as Anthropic API

    App->>Client: getAnthropicClient()
    
    Client->>Client: isClaudeAISubscriber()
    Note over Client: Returns false
    
    Client->>Env: Check ANTHROPIC_API_KEY
    Env-->>Client: sk-ant-xxxxxxxxxxxxx
    
    Client->>Client: Create Anthropic client
    Note over Client: apiKey: sk-ant-xxx...
    
    Client->>Client: Add default headers
    Note over Client: x-app: cli<br/>User-Agent: ...<br/>X-Claude-Code-Session-Id: ...
    
    Client-->>App: Anthropic client instance
    
    App->>API: POST /v1/messages
    Note over API: Request Headers:<br/>x-api-key: sk-ant-xxx...<br/>x-app: cli<br/>...
    
    API->>API: Validate API key
    API-->>App: 200 OK + Response
```

**Key Points:**
- Simplest method
- API key sent in `x-api-key` header
- Direct to Anthropic API
- No token refresh needed

**Environment Variables:**
```bash
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

**Log Output:**
```log
[CLIENT] getAnthropicClient called
[CLIENT] Creating client with API key
[CLIENT] Client configuration complete
```

---

## Method 3: Bearer Token

For custom gateways and proxies.

```mermaid
sequenceDiagram
    participant App as Application
    participant Client as API Client
    participant Auth as Auth Service
    participant Env as Environment
    participant Helper as API Key Helper
    participant API as API Endpoint

    App->>Client: getAnthropicClient()
    
    Client->>Auth: configureApiKeyHeaders(headers)
    
    Auth->>Env: Check ANTHROPIC_AUTH_TOKEN
    
    alt Has ANTHROPIC_AUTH_TOKEN
        Env-->>Auth: Bearer token value
        Auth->>Auth: headers['Authorization'] = Bearer {token}
    else No ENV token
        Auth->>Helper: getApiKeyFromApiKeyHelper()
        Note over Helper: Read from settings file<br/>or other source
        Helper-->>Auth: Token from helper
        Auth->>Auth: headers['Authorization'] = Bearer {token}
    end
    
    Auth-->>Client: Headers configured
    
    Client->>Client: Create Anthropic client
    Note over Client: defaultHeaders include<br/>Authorization: Bearer ...
    
    Client-->>App: Client instance
    
    App->>API: POST /v1/messages
    Note over API: Authorization: Bearer {token}<br/>x-app: cli<br/>...
    
    API->>API: Validate bearer token
    API-->>App: 200 OK + Response
```

**Key Points:**
- Uses `Authorization: Bearer` header
- Supports custom auth schemes
- Can read from helper/settings
- Good for proxies and gateways

**Environment Variables:**
```bash
ANTHROPIC_AUTH_TOKEN=your-bearer-token
```

**Log Output:**
```log
[AUTH] Using ANTHROPIC_AUTH_TOKEN
[CLIENT] Authorization header configured
[CLIENT] Creating client with Bearer auth
```

---

## Method 4: AWS Bedrock

For AWS Bedrock with IAM or bearer token.

```mermaid
sequenceDiagram
    participant App as Application
    participant Client as API Client
    participant Env as Environment
    participant Auth as Auth Service
    participant AWS as AWS SDK
    participant Bedrock as AWS Bedrock API

    App->>Client: getAnthropicClient(model)
    
    Client->>Env: Check CLAUDE_CODE_USE_BEDROCK
    Env-->>Client: "1" (enabled)
    
    Note over Client: Entering Bedrock path
    
    Client->>Env: Check AWS_BEARER_TOKEN_BEDROCK
    
    alt Has Bearer Token
        Env-->>Client: Bearer token
        Client->>Client: Configure skipAuth = true
        Client->>Client: Add Authorization header
        Note over Client: Authorization: Bearer {token}
    else No Bearer Token
        Client->>Env: Check ANTHROPIC_AUTH_TOKEN + SKIP_BEDROCK_AUTH
        
        alt Has Auth Token Fallback
            Env-->>Client: Auth token
            Client->>Client: skipAuth = true
            Client->>Client: Add Authorization header
            Note over Client: Authorization: Bearer {token}
        else Use AWS Credentials
            Client->>Auth: refreshAndGetAwsCredentials()
            Auth->>AWS: Get credentials from AWS SDK
            Note over AWS: Uses default credential chain:<br/>1. Environment vars<br/>2. IAM role<br/>3. ~/.aws/credentials
            AWS-->>Auth: {accessKeyId, secretAccessKey, sessionToken}
            Auth-->>Client: AWS credentials
            Client->>Client: Configure credentials
            Note over Client: awsAccessKey: xxx<br/>awsSecretKey: xxx<br/>awsSessionToken: xxx
        end
    end
    
    Client->>Client: Get AWS region
    Note over Client: From env or default: us-east-1
    
    Client->>Client: Create AnthropicBedrock client
    Client-->>App: Bedrock client instance
    
    App->>Bedrock: POST /model/anthropic.claude-xxx/invoke
    Note over Bedrock: Uses AWS Signature v4<br/>or Bearer token
    
    Bedrock->>Bedrock: Validate credentials
    Bedrock-->>App: Response
```

**Key Points:**
- Three auth options: Bearer token, Auth token fallback, IAM credentials
- Automatic credential refresh for IAM
- Regional configuration
- AWS SDK integration

**Environment Variables:**
```bash
# Option A: Bearer token
CLAUDE_CODE_USE_BEDROCK=1
AWS_BEARER_TOKEN_BEDROCK=your-token

# Option B: Auth token fallback
CLAUDE_CODE_USE_BEDROCK=1
CLAUDE_CODE_SKIP_BEDROCK_AUTH=1
ANTHROPIC_AUTH_TOKEN=your-token

# Option C: AWS IAM credentials
CLAUDE_CODE_USE_BEDROCK=1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_SESSION_TOKEN=xxx  # Optional
AWS_REGION=us-east-1
```

**Log Output:**
```log
[CLIENT] Entering BEDROCK path - AWS_BEARER_TOKEN_BEDROCK: true, ANTHROPIC_AUTH_TOKEN: false
[AUTH] Using AWS_BEARER_TOKEN_BEDROCK
[CLIENT] Creating AnthropicBedrock client - has Authorization header: true
```

Or with IAM:
```log
[CLIENT] Entering BEDROCK path
[AUTH] Using AWS credentials refresh
[AUTH] AWS credentials refreshed successfully
[CLIENT] Creating AnthropicBedrock client with IAM credentials
```

---

## Method 5: GCP Vertex AI

For Google Cloud Vertex AI.

```mermaid
sequenceDiagram
    participant App as Application
    participant Client as API Client
    participant Env as Environment
    participant Auth as Auth Service
    participant GCP as Google Auth Library
    participant Vertex as Vertex AI API

    App->>Client: getAnthropicClient(model)
    
    Client->>Env: Check CLAUDE_CODE_USE_VERTEX
    Env-->>Client: "1" (enabled)
    
    Note over Client: Entering Vertex path
    
    Client->>Env: Check CLAUDE_CODE_SKIP_VERTEX_AUTH
    
    alt Skip Auth (for testing/proxy)
        Env-->>Client: "1"
        Client->>Client: Create mock GoogleAuth
        Note over Client: Mock returns empty tokens
    else Use Real Auth
        Env-->>Client: undefined
        Client->>Auth: refreshGcpCredentialsIfNeeded()
        
        Auth->>GCP: Check credential expiry
        
        alt Credentials Expired
            GCP->>GCP: Refresh from credential source
            Note over GCP: Sources:<br/>1. GOOGLE_APPLICATION_CREDENTIALS<br/>2. Service account key<br/>3. Application Default Credentials
            GCP-->>Auth: New credentials
        else Credentials Valid
            Note over Auth: No refresh needed
        end
        
        Auth-->>Client: Credentials ready
        
        Client->>Env: Get project configuration
        Note over Env: ANTHROPIC_VERTEX_PROJECT_ID<br/>GOOGLE_CLOUD_PROJECT
        Env-->>Client: Project ID
        
        Client->>Client: Create GoogleAuth instance
        Note over Client: GoogleAuth({<br/>  projectId: xxx,<br/>  scopes: ['cloud-platform']<br/>})
    end
    
    Client->>Client: Get Vertex region for model
    Note over Client: From model-specific env vars<br/>or CLOUD_ML_REGION
    
    Client->>Client: Create AnthropicVertex client
    Client-->>App: Vertex client instance
    
    App->>Vertex: POST /v1/projects/{project}/locations/{region}/publishers/anthropic/models/{model}:streamRawPredict
    Note over Vertex: Authorization: Bearer {gcp_token}<br/>x-goog-user-project: {project}
    
    Vertex->>Vertex: Validate GCP credentials
    Vertex-->>App: Response stream
```

**Key Points:**
- Uses Google Cloud authentication
- Automatic credential refresh
- Regional model routing
- Service account support

**Environment Variables:**
```bash
CLAUDE_CODE_USE_VERTEX=1
ANTHROPIC_VERTEX_PROJECT_ID=your-gcp-project
CLOUD_ML_REGION=us-east5

# Credentials via:
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
# Or use Application Default Credentials
```

**Log Output:**
```log
[CLIENT] Entering VERTEX path
[AUTH] Checking GCP credentials
[AUTH] GCP credentials valid, no refresh needed
[CLIENT] Creating AnthropicVertex client - region: us-east5, project: my-project
```

---

## Method 6: Azure Foundry

For Microsoft Azure Foundry.

```mermaid
sequenceDiagram
    participant App as Application
    participant Client as API Client
    participant Env as Environment
    participant Azure as Azure Identity
    participant Foundry as Azure Foundry API

    App->>Client: getAnthropicClient()
    
    Client->>Env: Check CLAUDE_CODE_USE_FOUNDRY
    Env-->>Client: "1" (enabled)
    
    Note over Client: Entering Foundry path
    
    Client->>Env: Check ANTHROPIC_FOUNDRY_API_KEY
    
    alt Has API Key
        Env-->>Client: API key value
        Client->>Client: Configure with API key
        Note over Client: SDK will use x-api-key header
    else No API Key - Use Azure AD
        Client->>Env: Check CLAUDE_CODE_SKIP_FOUNDRY_AUTH
        
        alt Skip Auth (for testing)
            Env-->>Client: "1"
            Client->>Client: Create mock token provider
            Note over Client: Returns empty token
        else Use Azure AD
            Env-->>Client: undefined
            Client->>Azure: new DefaultAzureCredential()
            Note over Azure: Tries multiple auth methods:<br/>1. Environment variables<br/>2. Managed Identity<br/>3. Azure CLI<br/>4. Visual Studio
            
            Azure->>Azure: Authenticate
            Azure-->>Client: Credential object
            
            Client->>Azure: getBearerTokenProvider(credential, scope)
            Note over Azure: Scope: cognitiveservices.azure.com
            Azure-->>Client: Token provider function
            
            Client->>Client: Configure with token provider
            Note over Client: azureADTokenProvider: () => Promise<token>
        end
    end
    
    Client->>Env: Get Foundry resource
    Note over Env: ANTHROPIC_FOUNDRY_RESOURCE<br/>or ANTHROPIC_FOUNDRY_BASE_URL
    Env-->>Client: Resource name or URL
    
    Client->>Client: Create AnthropicFoundry client
    Client-->>App: Foundry client instance
    
    App->>Foundry: POST /{resource}.services.ai.azure.com/anthropic/v1/messages
    
    alt Using API Key
        Note over Foundry: x-api-key: {api_key}
    else Using Azure AD
        Foundry->>Azure: Get current token
        Azure-->>Foundry: Bearer token
        Note over Foundry: Authorization: Bearer {azure_token}
    end
    
    Foundry->>Foundry: Validate credentials
    Foundry-->>App: Response
```

**Key Points:**
- Two auth options: API key or Azure AD
- DefaultAzureCredential tries multiple methods
- Automatic token refresh for Azure AD
- Resource-based URL configuration

**Environment Variables:**
```bash
# Option A: API Key
CLAUDE_CODE_USE_FOUNDRY=1
ANTHROPIC_FOUNDRY_RESOURCE=my-resource
ANTHROPIC_FOUNDRY_API_KEY=your-api-key

# Option B: Azure AD
CLAUDE_CODE_USE_FOUNDRY=1
ANTHROPIC_FOUNDRY_RESOURCE=my-resource
# Azure credentials via:
# - AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID
# - Managed Identity
# - Azure CLI (az login)
```

**Log Output:**
```log
[CLIENT] Entering FOUNDRY path
[CLIENT] Using Azure AD authentication
[AUTH] DefaultAzureCredential initialized
[CLIENT] Creating AnthropicFoundry client with token provider
```

---

## Authentication Flow Summary

| Method | Header Type | Token Source | Refresh | Platform |
|--------|-------------|--------------|---------|----------|
| **OAuth** | Bearer | Token storage | Auto | Claude.ai |
| **API Key** | x-api-key | Environment | N/A | Anthropic |
| **Bearer Token** | Bearer | Environment/Helper | Manual | Custom |
| **Bedrock** | Varies | AWS SDK / Bearer | Auto | AWS |
| **Vertex AI** | Bearer | Google Auth | Auto | GCP |
| **Foundry** | Varies | Azure AD / API Key | Auto | Azure |

---

## Quick Reference

### Check Which Method is Used

```bash
# View auth logs
grep "\[AUTH\]" ~/.claude/logs/debug.log | tail -10

# See client creation
grep "\[CLIENT\]" ~/.claude/logs/debug.log | grep -i "auth\|token\|key"
```

### Common Auth Issues

```bash
# Token expired
[ERROR] [AUTH] OAuth token expired and refresh failed

# Invalid API key
[ERROR] [CLIENT] Authentication failed: invalid x-api-key

# AWS credentials not found
[ERROR] [AUTH] Unable to load AWS credentials

# GCP credentials missing
[ERROR] [CLIENT] Could not load Application Default Credentials
```

---

## Related Documentation

- [ARCHITECTURE.md](../ARCHITECTURE.md) - Complete architecture overview
- [Request Lifecycle Diagram](sequence-diagram.md) - Full request flow
- [Example Queries](../examples/) - Real usage examples

---

## Testing Authentication

To test your authentication setup:

```bash
# Set your credentials
export ANTHROPIC_API_KEY=sk-ant-xxx

# Run a simple query
echo "test" | ./bin/claude-code-insideout -p

# Check auth logs
grep "\[AUTH\]" ~/.claude/logs/debug.log | tail -5
grep "\[CLIENT\]" ~/.claude/logs/debug.log | tail -5
```

Expected output:
```log
[AUTH] OAuth token check starting
[AUTH] OAuth token check complete
[CLIENT] getAnthropicClient called
[CLIENT] Creating client with API key
```
