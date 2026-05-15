@echo off
setlocal enabledelayedexpansion

:: Resolve project root (directory containing this .bat file)
set "ROOT_DIR=%~dp0"
:: Remove trailing backslash
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

:: Load .env file if it exists (handles bash-style "export KEY=val" and plain "KEY=val")
if exist "%ROOT_DIR%\.env" (
    for /f "usebackq tokens=* eol=#" %%a in ("%ROOT_DIR%\.env") do (
        set "LINE=%%a"
        if defined LINE (
            :: Strip leading "export " if present (bash-style .env)
            set "CLEAN=!LINE!"
            if "!CLEAN:~0,7!"=="export " set "CLEAN=!CLEAN:~7!"
            :: Skip comments
            echo !CLEAN! | findstr /b "#" >nul 2>&1
            if errorlevel 1 (
                set "!CLEAN!"
            )
        )
    )
)

:: Configure for Salesforce Bedrock gateway (example - set your own URL)
:: Uncomment and configure these for your Bedrock gateway:
:: set CLAUDE_CODE_USE_BEDROCK=1
:: set CLAUDE_CODE_SKIP_BEDROCK_AUTH=1
:: set ANTHROPIC_BEDROCK_BASE_URL=https://your-gateway-url/bedrock

:: Check if bun is available
where bun >nul 2>&1
if errorlevel 1 (
    echo Error: bun is not installed or not in PATH.
    echo.
    echo Install bun for Windows:
    echo   powershell -c "irm bun.sh/install.ps1 | iex"
    echo.
    echo Or via npm:
    echo   npm install -g bun
    echo.
    exit /b 1
)

:: Force recovery CLI (simple readline REPL, no Ink TUI)
if "%CLAUDE_CODE_FORCE_RECOVERY_CLI%"=="1" (
    bun run ./src/localRecoveryCli.ts %*
    exit /b %errorlevel%
)

:: Default: full CLI with Ink TUI
bun run ./src/entrypoints/cli.tsx %*
exit /b %errorlevel%
