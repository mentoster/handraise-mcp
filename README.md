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
