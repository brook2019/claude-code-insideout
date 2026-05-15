# claude-code-insideout.ps1
# PowerShell launcher for claude-code-insideout on Windows
# Usage: .\claude-code-insideout.ps1 [arguments...]

$ErrorActionPreference = "Stop"

# Resolve project root
$ROOT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ROOT_DIR

# Load .env file if it exists
$envFile = Join-Path $ROOT_DIR ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        # Skip empty lines and comments
        if ($line -and -not $line.StartsWith("#")) {
            # Strip leading "export " (bash-style .env)
            if ($line.StartsWith("export ")) {
                $line = $line.Substring(7)
            }
            $parts = $line -split "=", 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $value = $parts[1].Trim()
                # Remove surrounding quotes if present
                if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                    ($value.StartsWith("'") -and $value.EndsWith("'"))) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
}

# Configure for Salesforce Bedrock gateway (example - set your own URL)
# Uncomment and configure these for your Bedrock gateway:
# $env:CLAUDE_CODE_USE_BEDROCK = "1"
# $env:CLAUDE_CODE_SKIP_BEDROCK_AUTH = "1"
# $env:ANTHROPIC_BEDROCK_BASE_URL = "https://your-gateway-url/bedrock"

# Fix platform-specific paths from .env (macOS paths won't work on Windows)
if ($env:CLAUDE_CODE_DEBUG_LOG -and $env:CLAUDE_CODE_DEBUG_LOG.StartsWith("/Users/")) {
    $claudeDir = Join-Path $env:USERPROFILE ".claude\logs"
    if (-not (Test-Path $claudeDir)) { New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null }
    $env:CLAUDE_CODE_DEBUG_LOG = Join-Path $claudeDir "debug.log"
}

# Check if bun is available
$bunPath = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunPath) {
    Write-Host "Error: bun is not installed or not in PATH." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install bun for Windows:"
    Write-Host "  powershell -c `"irm bun.sh/install.ps1 | iex`""
    Write-Host ""
    Write-Host "Or via npm:"
    Write-Host "  npm install -g bun"
    Write-Host ""
    exit 1
}

# Force recovery CLI (simple readline REPL, no Ink TUI)
if ($env:CLAUDE_CODE_FORCE_RECOVERY_CLI -eq "1") {
    & bun run ./src/localRecoveryCli.ts @args
    exit $LASTEXITCODE
}

# Default: full CLI with Ink TUI
& bun run ./src/entrypoints/cli.tsx @args
exit $LASTEXITCODE
