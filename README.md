# justcode

A desktop AI coding assistant built on Avalonia + React. A .NET shell hosts a web UI and runs an LLM-powered agent that can read, edit, search, and run commands inside your workspace.

## Overview

justcode combines a native desktop shell with a modern web frontend:

- **Desktop shell** — `JustCode.Desktop/` (Avalonia, .NET 10) owns the AI runtime: LLM providers, the agent loop, tool execution, permission/approval flow, and local persistence for projects, sessions, and API configurations.
- **Frontend** — `src/` (Vite + React 19 + TypeScript) renders the chat UI with streaming output, thinking blocks, tool status, and token usage. It runs inside an Avalonia `WebView`.
- **Native bridge** — the UI and the shell talk over a JSON message bridge (`invokeCSharpAction` / `justcodePostMessage`) with command/response semantics plus streaming events for text chunks, tool status, reasoning deltas, and tool-approval requests.

## Features

- **Agentic chat with tool use** — the assistant can work on your files directly via:
  - `read_file`, `write`, `edit_file` (with diffs)
  - `list_dir`, `search`
  - `bash` (sandboxed to the workspace)
  - `web_search`, `web_fetch`
- **Streaming responses** — incremental output with separate reasoning ("thinking") chunks and live tool status.
- **Multi-tab sessions** — independent, concurrent chat streams keyed by agent id; each can be cancelled individually.
- **Tool approvals** — sensitive tools can require explicit user approval before execution.
- **Multiple API configurations** — OpenAI-compatible providers, configurable model, base URL, API key, thinking mode, strict mode, and max context tokens. Switch the active config at any time.
- **Projects & sessions** — persisted locally via `AppData`, with per-project scoping.
- **Token estimation** — rough context-usage counter surfaced in the UI (mirrors the desktop `TokenEstimator`).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    JustCode.Desktop                     │
│   (Avalonia, .NET 10)                                   │
│                                                         │
│   ┌───────────────────────────────────────────────────┐ │
│   │  Bridge (JSON command/response + streaming)       │ │
│   └───────────────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────────────┐ │
│   │  AgentProcessor  ·  PermissionService            │ │
│   │  LlmProviderService / OpenAiService              │ │
│   │  Tools (file, search, bash, web)                 │ │
│   │  SessionService · ProjectService · ApiConfigService│ │
│   └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ▲ invokeCSharpAction /
                          │ justcodePostMessage
┌─────────────────────────┴─────────────────────────────────┐
│  Frontend (Vite + React 19 + TypeScript)                   │
│  src/bridge.ts  ·  src/components  ·  src/hooks            │
│  Chat UI · streaming · tool status · approvals · tokens    │
└────────────────────────────────────────────────────────────┘
```

### Repo layout

| Path | Description |
| --- | --- |
| `src/` | React + TypeScript frontend (chat UI, bridge client, settings, token estimate) |
| `src/bridge.ts` | Client for the native bridge: request/response, streaming, tool status, approvals |
| `JustCode.Desktop/` | Avalonia shell and AI runtime |
| `JustCode.Desktop/Bridge/` | Native-side bridge (`Bridge.cs`) |
| `JustCode.Desktop/Services/` | Agent loop, LLM providers, sessions, projects, API configs, permissions |
| `JustCode.Desktop/Tools/` | Agent tools: file read/write/edit, list, search, bash, web search/fetch |
| `JustCode.Desktop/Infrastructure/` | App paths, JSON helpers, local server, token estimator, logging |
| `run.bat` | Starts the frontend dev server and the desktop app together |

## Getting started

### Prerequisites

- Node.js (with npm)
- .NET 10 SDK

### Run

On Windows, from the repo root:

```bat
run.bat
```

or manually in two terminals:

```bat
cd src
npm install
npm run dev
```

```bat
cd JustCode.Desktop
dotnet run
```

### Build

```bat
cd src
npm run build      # type-checks + builds the frontend (tsc && vite build)
```

## Configuration

API providers are managed in the UI (**Settings**). Each configuration stores:

- name, base URL, API key
- model, `enableThinking`, `strictMode`, `thinkingOptions`
- `maxContextTokens`

The active configuration is used for new chat sessions and can be switched at any time.

## How the bridge works

1. The frontend calls `invoke(cmd, args, { onChunk, onToolStatus, onReasoningDelta })`, which sends a JSON message to the native side via `invokeCSharpAction`.
2. The native shell responds through `justcodePostMessage` with:
   - `response` — final result (resolves/rejects the pending promise)
   - `chunk` — streaming text deltas
   - `tool_status` — tool start/done events (including diffs)
   - `reasoning_chunk` — streaming thinking content
   - `tool_approval` — a pending approval request handled by the UI

Requests time out after 50 minutes by default; the bridge waits up to 5 seconds for the native bridge to become available.

## License

Proprietary. Copyright © 2025. All rights reserved.
