# Claude Code Inside Out

<p align="right"><a href="./README.md">English</a> | <strong>中文</strong></p>

**深入理解 Claude Code 的工作原理** —— 基于 [claude-code-haha](https://github.com/mygu/claude-code-haha) 项目并在关键代码路径中添加详细日志。

本项目旨在帮助开发者理解 Claude Code 客户端与大语言模型（LLM）之间的交互机制，通过可视化的日志输出揭示：
- 🔍 完整的请求/响应生命周期
- 🛠️ Tool 调用与执行流程
- 💬 消息流转与上下文管理
- 📊 Token 使用与缓存机制
- 🔐 认证与 API 客户端初始化

> **基础**: 原始泄露源码无法直接运行。本仓库基于 claude-code-haha 的修复，进一步增强了可观测性，使你能够"看透" Claude Code 的内部工作机制。

> **📍 调试日志位置：**  
> 所有内部日志自动保存到 **`~/.claude/logs/debug.log`**（Linux/macOS）或 **`%USERPROFILE%\.claude\logs\debug.log`**（Windows）。  
> 实时查看：`tail -f ~/.claude/logs/debug.log`

<p align="center">
  <img src="docs/00runtime.png" alt="运行截图" width="800">
</p>

## 📊 日志输出示例

增强的日志系统展示了完整的请求生命周期。以下是运行查询时你将看到的内容：

```log
[TRACE] processUserInput called - mode: prompt, inputString: <用户提示>, skipSlashCommands: false
[TRACE] processUserInput result: shouldQuery=true, messages.length=3, model=default
[TRACE] Calling onQuery - shouldQuery=true, allowedTools=[], model=claude-sonnet-4.5, primaryInput="<提示>", newMessages.length=3

[TRACE] [REPL] onQuery called - shouldQuery: true, newMessages.length: 3, model: claude-sonnet-4.5
[TRACE] [REPL] Query guard acquired, generation: 1
[TRACE] [REPL] onQueryImpl started - shouldQuery: true, messagesIncludingNewMessages.length: 6
[TRACE] [REPL] Starting query() generator loop

[TRACE] query() called - messages.length: 6, model: undefined, systemPrompt length: 11
[TRACE] [REPL] Received event from query() - type: stream_request_start

[TRACE] [QUERY] Entering API call loop - attemptWithFallback: true
[TRACE] [QUERY] Starting API call iteration - turnCount: 1, model: claude-sonnet-4.5, messagesForQuery.length: 6
[TRACE] [LLM] queryModelWithVCR called - messages.length: 7, tools.length: 22, model: claude-sonnet-4.5

[TRACE] API Request - model: claude-haiku-4.5, max_tokens: 32000, messages.length: 1, tools.length: 0
[TRACE] [LLM] Send request to LLM:
{
  "model": "claude-haiku-4.5",
  "messages": [{"role": "user", "content": [{"type": "text", "text": "<用户提示>"}]}],
  "system": [
    {"type": "text", "text": "x-anthropic-billing-header: cc_version=999.0.0-local.xxx; cc_entrypoint=cli;"},
    {"type": "text", "text": "You are Claude Code, Anthropic's official CLI for Claude."},
    {"type": "text", "text": "Generate a concise, sentence-case title..."}
  ],
  "metadata": {"user_id": "{\"device_id\":\"<设备ID>\",\"session_id\":\"<会话ID>\"}"},
  "max_tokens": 32000,
  "temperature": 1
}
```

**揭示的关键信息：**
- **输入处理**：用户提示如何被解析和验证
- **消息流转**：跟踪消息在管道中的数量变化
- **模型选择**：查看不同任务选择了哪些模型
- **工具可用性**：监控可用工具（本例中有 22 个工具）
- **API 请求结构**：完整查看发送给 LLM 的请求参数
- **系统提示**：理解 Claude Code 如何指导 AI
- **查询生命周期**：从用户输入 → 处理 → API 调用 → 响应流式传输

**📊 [查看完整请求流程时序图](docs/sequence-diagram.md)** - 交互式 Mermaid 图表，展示整个请求生命周期及所有组件的交互关系。

**🔐 [查看认证流程图](docs/authentication-flow.md)** - 6 种认证方法的详细时序图，包含决策树和日志示例。

**📘 [探索示例查询与日志分析](examples/)** - 4 个详细示例，展示简单查询、工具使用、多工具协作和错误处理的完整日志分解。

## 功能

- 完整的 Ink TUI 交互界面（与官方 Claude Code 一致）
- `--print` 无头模式（脚本/CI 场景）
- 支持 MCP 服务器、插件、Skills
- 支持自定义 API 端点和模型
- 降级 Recovery CLI 模式

---

## 架构概览

**📚 [阅读完整架构文档](ARCHITECTURE.md)** - 详细指南，涵盖认证系统、请求生命周期、工具执行和所有内部组件。

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/01-overall-architecture.png" alt="整体架构"><br><b>整体架构</b></td>
    <td align="center" width="25%"><img src="docs/02-request-lifecycle.png" alt="请求生命周期"><br><b>请求生命周期</b></td>
    <td align="center" width="25%"><img src="docs/03-tool-system.png" alt="工具系统"><br><b>工具系统</b></td>
    <td align="center" width="25%"><img src="docs/04-multi-agent.png" alt="多 Agent 架构"><br><b>多 Agent 架构</b></td>
  </tr>
  <tr>
    <td align="center" width="25%"><img src="docs/05-terminal-ui.png" alt="终端 UI"><br><b>终端 UI</b></td>
    <td align="center" width="25%"><img src="docs/06-permission-security.png" alt="权限与安全"><br><b>权限与安全</b></td>
    <td align="center" width="25%"><img src="docs/07-services-layer.png" alt="服务层"><br><b>服务层</b></td>
    <td align="center" width="25%"><img src="docs/08-state-data-flow.png" alt="状态与数据流"><br><b>状态与数据流</b></td>
  </tr>
</table>

---

## 快速开始

### 1. 安装 Bun

本项目运行依赖 [Bun](https://bun.sh)。如果你的电脑还没有安装 Bun，可以先执行下面任一方式：

```bash
# macOS / Linux（官方安装脚本）
curl -fsSL https://bun.sh/install | bash
```

如果在精简版 Linux 环境里提示 `unzip is required to install bun`，先安装 `unzip`：

```bash
# Ubuntu / Debian
apt update && apt install -y unzip
```

```bash
# macOS（Homebrew）
brew install bun
```

```powershell
# Windows（PowerShell）
powershell -c "irm bun.sh/install.ps1 | iex"
```

安装完成后，重新打开终端并确认：

```bash
bun --version
```

### 2. 安装项目依赖

```bash
bun install
```

### 3. 配置环境变量

复制示例文件并填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# API 认证（二选一）
ANTHROPIC_API_KEY=sk-xxx          # 标准 API Key（x-api-key 头）
ANTHROPIC_AUTH_TOKEN=sk-xxx       # Bearer Token（Authorization 头）

# API 端点（可选，默认 Anthropic 官方）
ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic

# 模型配置
ANTHROPIC_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_SONNET_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_HAIKU_MODEL=MiniMax-M2.7-highspeed
ANTHROPIC_DEFAULT_OPUS_MODEL=MiniMax-M2.7-highspeed

# 超时（毫秒）
API_TIMEOUT_MS=3000000

# 禁用遥测和非必要网络请求
DISABLE_TELEMETRY=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### 4. 启动

#### macOS / Linux

```bash
# 交互 TUI 模式（完整界面）
./bin/claude-code-insideout

# 无头模式（单次问答）
./bin/claude-code-insideout -p "your prompt here"

# 管道输入
echo "explain this code" | ./bin/claude-code-insideout -p

# 查看所有选项
./bin/claude-code-insideout --help
```

#### Windows

> **前置要求**：必须安装 [Git for Windows](https://git-scm.com/download/win)（提供 Git Bash，项目内部 Shell 执行依赖它）。

Windows 下启动脚本 `bin/claude-code-insideout` 是 bash 脚本，无法在 cmd / PowerShell 中直接运行。请使用以下方式：

**方式一：PowerShell / cmd 直接调用 Bun（推荐）**

```powershell
# 交互 TUI 模式
bun --env-file=.env ./src/entrypoints/cli.tsx

# 无头模式
bun --env-file=.env ./src/entrypoints/cli.tsx -p "your prompt here"

# 降级 Recovery CLI
bun --env-file=.env ./src/localRecoveryCli.ts
```

**方式二：Git Bash 中运行**

```bash
# 在 Git Bash 终端中，与 macOS/Linux 用法一致
./bin/claude-code-insideout
```

> **注意**：部分功能（语音输入、Computer Use、Sandbox 隔离等）在 Windows 上不可用，不影响核心 TUI 交互。

---

## 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `ANTHROPIC_API_KEY` | 二选一 | API Key，通过 `x-api-key` 头发送 |
| `ANTHROPIC_AUTH_TOKEN` | 二选一 | Auth Token，通过 `Authorization: Bearer` 头发送 |
| `ANTHROPIC_BASE_URL` | 否 | 自定义 API 端点，默认 Anthropic 官方 |
| `ANTHROPIC_MODEL` | 否 | 默认模型 |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | 否 | Sonnet 级别模型映射 |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 否 | Haiku 级别模型映射 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | 否 | Opus 级别模型映射 |
| `API_TIMEOUT_MS` | 否 | API 请求超时，默认 600000 (10min) |
| `DISABLE_TELEMETRY` | 否 | 设为 `1` 禁用遥测 |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | 否 | 设为 `1` 禁用非必要网络请求 |
| `CLAUDE_CODE_DEBUG_ENABLED` | 否 | 启用调试日志，默认 `1`（启用）。设为 `0` 禁用 |
| `CLAUDE_CODE_DEBUG_LOG` | 否 | 自定义日志文件路径。默认：`~/.claude/logs/debug.log`（Linux/macOS）或 `%USERPROFILE%\.claude\logs\debug.log`（Windows）|

---

## 🔍 调试日志

增强的调试日志默认启用，帮助你理解 Claude Code 的内部机制。

**默认日志位置：**
- **Linux/macOS**: `~/.claude/logs/debug.log`
- **Windows**: `%USERPROFILE%\.claude\logs\debug.log`

**配置方法：**

```bash
# 禁用日志
export CLAUDE_CODE_DEBUG_ENABLED=0

# 自定义日志路径（所有平台通用）
export CLAUDE_CODE_DEBUG_LOG=/path/to/your/debug.log

# Windows PowerShell:
$env:CLAUDE_CODE_DEBUG_LOG="C:\logs\claude-debug.log"
```

**实时查看日志：**

```bash
# Linux/macOS
tail -f ~/.claude/logs/debug.log

# Windows PowerShell
Get-Content "$env:USERPROFILE\.claude\logs\debug.log" -Wait -Tail 50
```

日志系统自动：
- ✅ 如果目录不存在则自动创建
- ✅ 如果主目录不可访问则回退到临时目录
- ✅ 跨平台支持（Linux、macOS、Windows）
- ✅ 静默失败以避免中断应用程序

---

## 降级模式

如果完整 TUI 出现问题，可以使用简化版 readline 交互模式：

```bash
CLAUDE_CODE_FORCE_RECOVERY_CLI=1 ./bin/claude-code-insideout
```

---

## 相对于原始泄露源码的修复

泄露的源码无法直接运行，主要修复了以下问题：

| 问题 | 根因 | 修复 |
|------|------|------|
| TUI 不启动 | 入口脚本把无参数启动路由到了 recovery CLI | 恢复走 `cli.tsx` 完整入口 |
| 启动卡死 | `verify` skill 导入缺失的 `.md` 文件，Bun text loader 无限挂起 | 创建 stub `.md` 文件 |
| `--print` 卡死 | `filePersistence/types.ts` 缺失 | 创建类型桩文件 |
| `--print` 卡死 | `ultraplan/prompt.txt` 缺失 | 创建资源桩文件 |
| **Enter 键无响应** | `modifiers-napi` native 包缺失，`isModifierPressed()` 抛异常导致 `handleEnter` 中断，`onSubmit` 永远不执行 | 加 try-catch 容错 |
| setup 被跳过 | `preload.ts` 自动设置 `LOCAL_RECOVERY=1` 跳过全部初始化 | 移除默认设置 |

---

## 项目结构

```
bin/claude-code-insideout          # 入口脚本
preload.ts               # Bun preload（设置 MACRO 全局变量）
.env.example             # 环境变量模板
src/
├── entrypoints/cli.tsx  # CLI 主入口
├── main.tsx             # TUI 主逻辑（Commander.js + React/Ink）
├── localRecoveryCli.ts  # 降级 Recovery CLI
├── setup.ts             # 启动初始化
├── screens/REPL.tsx     # 交互 REPL 界面
├── ink/                 # Ink 终端渲染引擎
├── components/          # UI 组件
├── tools/               # Agent 工具（Bash, Edit, Grep 等）
├── commands/            # 斜杠命令（/commit, /review 等）
├── skills/              # Skill 系统
├── services/            # 服务层（API, MCP, OAuth 等）
├── hooks/               # React hooks
└── utils/               # 工具函数
```

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | [Bun](https://bun.sh) |
| 语言 | TypeScript |
| 终端 UI | React + [Ink](https://github.com/vadimdemedes/ink) |
| CLI 解析 | Commander.js |
| API | Anthropic SDK |
| 协议 | MCP, LSP |

---

## Disclaimer

本仓库基于 2026-03-31 从 Anthropic npm registry 泄露的 Claude Code 源码。所有原始源码版权归 [Anthropic](https://www.anthropic.com) 所有。仅供学习和研究用途。
