# setup-windows.ps1
# One-time setup script for claude-code-insideout on Windows
# Run: powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== claude-code-insideout Windows Setup ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "Checking Node.js..." -NoNewline
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $nodeVersion = & node --version
    Write-Host " $nodeVersion" -ForegroundColor Green
} else {
    Write-Host " NOT FOUND" -ForegroundColor Red
    Write-Host "  Install from: https://nodejs.org/" -ForegroundColor Yellow
}

# 2. Check bun
Write-Host "Checking bun..." -NoNewline
$bun = Get-Command bun -ErrorAction SilentlyContinue
if ($bun) {
    $bunVersion = & bun --version
    Write-Host " $bunVersion" -ForegroundColor Green
} else {
    Write-Host " NOT FOUND" -ForegroundColor Red
    Write-Host "  Installing bun..." -ForegroundColor Yellow
    try {
        powershell -c "irm bun.sh/install.ps1 | iex"
        Write-Host "  bun installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "  Failed to install bun. Install manually:" -ForegroundColor Red
        Write-Host "    powershell -c `"irm bun.sh/install.ps1 | iex`""
        Write-Host "    or: npm install -g bun"
    }
}

# 3. Check git
Write-Host "Checking git..." -NoNewline
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) {
    $gitVersion = & git --version
    Write-Host " $gitVersion" -ForegroundColor Green
} else {
    Write-Host " NOT FOUND" -ForegroundColor Red
    Write-Host "  Install from: https://git-scm.com/download/win" -ForegroundColor Yellow
}

# 4. Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan
$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ROOT_DIR

if (Get-Command bun -ErrorAction SilentlyContinue) {
    & bun install
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Dependencies installed successfully" -ForegroundColor Green
    } else {
        Write-Host "Failed to install dependencies" -ForegroundColor Red
    }
} else {
    Write-Host "Skipping: bun not available" -ForegroundColor Yellow
}

# 5. Create .env if not exists
$envFile = Join-Path $ROOT_DIR ".env"
if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host "Creating .env file..." -ForegroundColor Cyan
    @"
# claude-code-insideout environment configuration
# Uncomment and set values as needed

# Authentication (required - set one of these)
# ANTHROPIC_API_KEY=sk-ant-your-key-here
# ANTHROPIC_AUTH_TOKEN=your-token-here

# Bedrock gateway (optional)
# CLAUDE_CODE_USE_BEDROCK=1
# CLAUDE_CODE_SKIP_BEDROCK_AUTH=1
# ANTHROPIC_BEDROCK_BASE_URL=https://your-gateway-url/bedrock

# Model override (optional)
# ANTHROPIC_MODEL=claude-sonnet-4-6
"@ | Set-Content $envFile -Encoding UTF8
    Write-Host ".env created at: $envFile" -ForegroundColor Green
    Write-Host "  Edit it to add your API key or auth token" -ForegroundColor Yellow
} else {
    Write-Host ".env already exists" -ForegroundColor Green
}

# 6. Summary
Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "To run claude-code-insideout:" -ForegroundColor White
Write-Host "  Option 1 (CMD):        claude-code-insideout.bat" -ForegroundColor White
Write-Host "  Option 2 (PowerShell): .\claude-code-insideout.ps1" -ForegroundColor White
Write-Host "  Option 3 (npm):        bun run start" -ForegroundColor White
Write-Host ""
Write-Host "Make sure to set your API key in .env first!" -ForegroundColor Yellow
