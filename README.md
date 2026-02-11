# handraise

<div align="center">

Policy-driven human approval for MCP tool calls.

Gate side-effecting tool invocations behind an explicit approve/deny decision, with a stable request payload and safe argument display (redaction + truncation).

[Getting started](#getting-started) · [Concepts](#concepts) · [API](#api) · [Development](#development)

</div>

`handraise` is an OpenCode-friendly checkpoint primitive: it lets an agent pause mid-run and wait for human input (human-in-the-loop) without requiring a new chat turn.

This repository provides a small TypeScript (ESM) library that wraps an MCP tool executor and requires an explicit human approval step before execution.

> [!NOTE]
> This repo is runtime-agnostic: you inject a `HandraiseAdapter` that performs the actual "wait for human" behavior (for example, an OpenCode checkpoint).

> [!IMPORTANT]
> Don’t log raw tool arguments. Use `displayArgs` produced by the gate (it applies redaction + truncation rules).

## Getting started

Minimal example: require approval for everything by default, allowlist a safe tool, and require explicit approval for a risky one.

```ts
import {
  createMcpHumanInLoopGate,
  type HandraiseAdapter,
  type McpApprovalPolicy,
  type McpToolCall,
} from "handraise";

const handraise: HandraiseAdapter = {
  async requestApproval(req) {
    // Render req.summary + req.displayArgs in your UI, then return a decision.
    // In OpenCode this is typically implemented by raising a checkpoint.
    return { decision: "approve" };
  },
};

const policy: McpApprovalPolicy = {
  defaultRequireApproval: true,
  allowlist: ["functions.grep"],
  tools: [
    {
      toolName: "functions.bash",
      requireApproval: true,
      risk: "high",
      argDisplay: {
        rules: [
          { kind: "redactKey", key: "token" },
          { kind: "redactKey", key: "password" },
        ],
      },
    },
  ],
};

const gate = createMcpHumanInLoopGate({
  policy,
  handraise,
  logger: {
    info: (event, payload) => console.info(event, payload),
    warn: (event, payload) => console.warn(event, payload),
  },
});

const call: McpToolCall = {
  toolName: "functions.bash",
  args: { command: "ls -la" },
};

const result = await gate.executeWithApproval(call, async (approvedCall) => {
  // This is where you call your real MCP tool.
  return runMcpTool(approvedCall.toolName, approvedCall.args);
});
```

## Concepts

### Approval request

When approval is required, the gate calls `handraise.requestApproval(request)` with:

- `traceId`: correlates the request, decision, and eventual tool execution
- `toolName`: MCP tool name
- `summary`: human-readable description of what will happen
- `risk`: `low | medium | high`
- `displayArgs`: safe-to-display arguments (redacted + truncated)
- `createdAtMs`: timestamp (ms)

### Decisions

Return one of:

- `{ decision: "approve" }`
- `{ decision: "approve", overrideArgs: unknown }` (optional edited inputs)
- `{ decision: "deny" }`
- `{ decision: "deny", reason?: string }`

Denied requests throw `McpHumanApprovalDeniedError` and do not execute the tool.

### Policy matching

Policy matching has stable precedence:

1. `allowlist` (bypass approval; risk defaults to `low`)
2. `denylist` (force approval; risk defaults to `high`)
3. Per-tool rule (`tools[]`)
4. `defaultRequireApproval`

> [!TIP]
> Start with `defaultRequireApproval: true`, then allowlist safe/read-only tools.

### Safe argument display

`displayArgs` is produced by `prepareArgsForDisplay()`:

- Redacts well-known secret keys by default (`apiKey`, `token`, `password`)
- Truncates long strings/arrays/objects
- Limits recursion depth

You can tighten these limits or add redaction rules per tool via `policy.tools[].argDisplay`.

## API

Most consumers only need these exports:

- `createMcpHumanInLoopGate(options)` → `{ executeWithApproval(call, executor) }`
- `defaultMcpApprovalPolicy()` and `matchPolicy(policy, toolName)`
- `prepareArgsForDisplay(args, options)`
- Types: `McpApprovalPolicy`, `McpToolCall`, `HandraiseAdapter`, `McpApprovalRequest`, `McpApprovalDecision`
- Errors: `McpHumanApprovalDeniedError`, `McpHumanApprovalInvalidDecisionError`

MCP server tools exposed by `src/mcp/server.ts`:

- `handraise_preview_approval`: evaluate policy and return display-safe arguments
- `handraise_apply_decision`: apply allow/deny with optional argument overrides
- `handraise_ask_user`: CLI-only askUser bridge (second terminal responder)
- `handraise_ask_user_cli_status`: show bridge state path and second-terminal responder command

## OpenCode MCP integration

Use the built-in stdio MCP server to connect this repository directly from a local `opencode.json`.

1. Build the project:

```bash
npm install
npm run build
```

2. Configure OpenCode in this folder (`opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "handraise": {
      "type": "local",
      "enabled": true,
      "command": ["raisehand-mcp"],
      "environment": {
        "HANDRAISE_DEFAULT_REQUIRE_APPROVAL": "{env:HANDRAISE_DEFAULT_REQUIRE_APPROVAL}",
        "HANDRAISE_ALLOWLIST": "{env:HANDRAISE_ALLOWLIST}",
        "HANDRAISE_DENYLIST": "{env:HANDRAISE_DENYLIST}",
        "HANDRAISE_ASK_USER_STATE_PATH": "{env:HANDRAISE_ASK_USER_STATE_PATH}",
        "HANDRAISE_ASK_USER_TIMEOUT_MS": "{env:HANDRAISE_ASK_USER_TIMEOUT_MS}"
      },
      "timeout": 10000
    }
  }
}
```

3. Start OpenCode in this repository and call tools from the MCP server namespace.

### Seamless-style askUser from MCP tools

Use `handraise_ask_user` when you need user input through CLI (no MCP elicitation UI required).

Example payload:

```json
{
  "header": "Deployment confirmation",
  "question": "How should we proceed?",
  "options": [
    { "label": "Deploy now" },
    { "label": "Wait for maintenance window" }
  ],
  "multiple": false,
  "custom": true,
  "customLabel": "Other"
}
```

Run this in a second terminal:

```bash
npm run ask-cli:start
```

TUI aliases:

```bash
npm run ask-tui:start
npm run handraise-ask-tui
```

Compatibility aliases:

```bash
npm run handraise-ask-cli
npm run handrize-ask-cli
```

The MCP tool call waits until the responder accepts/declines/cancels and returns an answer.

The responder opens an interactive TUI with queue navigation and hotkeys:

- `up/down`: move (prompt list or answer rows)
- `enter` (list mode): open answer mode for selected prompt
- `enter` (answer mode): toggle selected option or run selected action (`Submit`, `Decline`, `Cancel`)
- `esc`: exit answer mode (or exit app from list mode)

Answer preview is visible in both prompt list mode and answer mode.
Only one pending askUser question is allowed at a time.

Structured result shape:

- `action`: `accept | decline | cancel`
- `answer`: `string | string[] | null`
- `selectedOptions`: selected predefined options
- `customResponse`: optional freeform user text

Environment values:

- `HANDRAISE_DEFAULT_REQUIRE_APPROVAL`: `true` or `false`.
- `HANDRAISE_ALLOWLIST`: comma-separated tool names bypassing approval.
- `HANDRAISE_DENYLIST`: comma-separated tool names always requiring approval.
- `HANDRAISE_ASK_USER_STATE_PATH`: shared JSON state file used by the server and `ask-cli` responder.
- `HANDRAISE_ASK_USER_TIMEOUT_MS`: max wait time for CLI response in milliseconds.
- `HANDRAISE_ASK_USER_AUTOLAUNCH`: auto-open responder when MCP server connects (`true` by default; set `false` to disable).
- `HANDRAISE_ASK_USER_AUTOLAUNCH_CMD`: custom launch command for your terminal environment.

Autolaunch default order:

1. tmux (`new-window` if already inside tmux, otherwise detached `new-session`)
2. GUI terminal launchers (`x-terminal-emulator`, `gnome-terminal`, `konsole`, etc.)
3. manual start if no launcher is available

Troubleshooting:

- `Error: Cannot find module ./dist/src/mcp/server.js`: run `npm run build` first.
- MCP server starts but no tools appear: verify `command` path is exactly `./dist/src/mcp/server.js` and `type` is `local`.
- Unexpected approval behavior: check env values and confirm CSV formatting for allowlist/denylist.
- `handraise_ask_user` hangs in CLI mode: start responder in terminal 2 (`npm run ask-cli:start`) and ensure both processes share `HANDRAISE_ASK_USER_STATE_PATH`.
- Autolaunch says "skipped": set `HANDRAISE_ASK_USER_AUTOLAUNCH_CMD` (for example, a tmux split/new-window command) or start responder manually.

CLI binaries:

- `handraise-mcp` and `raisehand-mcp` both start the MCP server.
- `handraise-ask-tui`, `handraise-ask-cli`, and `handrize-ask-cli` start the second-terminal responder.

Start scripts:

- `npm run raisehand:start` (preferred)
- `npm run raisehand-start`
- `npm run mcp:start` (legacy alias)

## Development

Prerequisites:

- Node.js (uses `node --test`)
- npm

Common commands:

```bash
npm install
npm run build
npm test
```

Repository layout:

- `src/` library source (ESM)
- `src/mcp/` gate, policy matching, redaction, errors, types
- `test/` node:test tests (compiled to `dist/test`)
- `openspec/` spec-driven change artifacts (proposal/design/specs/tasks)

> [!NOTE]
> Tests run against the compiled output: `npm test` builds first, then runs `node --test dist/test`.
