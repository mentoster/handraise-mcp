# handraise

Handraise is an agent checkpoint primitive for OpenCode that lets an agent pause mid-run, raise its hand, and wait for human input (human-in-the-loop) without creating a new chat turn.

This repo currently provides a TypeScript library for gating MCP tool calls behind an explicit human approval step.

## MCP Human-In-Loop Gate (TypeScript)

Core entrypoint:

```ts
import {
  createMcpHumanInLoopGate,
  type HandraiseAdapter,
  type McpToolCall
} from "handraise";

const handraise: HandraiseAdapter = {
  async requestApproval(req) {
    // Render req.summary + req.displayArgs in your UI, then return a decision.
    return { decision: "approve" };
  }
};

const gate = createMcpHumanInLoopGate({
  policy: {
    defaultRequireApproval: true,
    allowlist: ["readFile"],
    tools: [{ toolName: "deleteFile", requireApproval: true, risk: "high" }]
  },
  handraise,
  logger: {
    info: (event, payload) => console.info(event, payload),
    warn: (event, payload) => console.warn(event, payload)
  }
});

async function invokeMcpTool(call: McpToolCall) {
  return gate.executeWithApproval(call, async ({ toolName, args }) => {
    // This is where you call your real MCP tool.
    return { toolName, args };
  });
}
```

### Approval Request Contract

The approval adapter receives a stable payload:

- `traceId`: correlates the request, decision, and eventual tool execution
- `toolName`: MCP tool name
- `summary`: human-readable description of what will happen
- `risk`: `low | medium | high`
- `displayArgs`: safe-to-display arguments (redacted + truncated)

### Decisions

Return one of:

- `{ decision: "approve" }`
- `{ decision: "approve", overrideArgs: ... }` (optional edited inputs)
- `{ decision: "deny", reason?: string }`

Denied requests throw `McpHumanApprovalDeniedError` and do not execute the tool.
