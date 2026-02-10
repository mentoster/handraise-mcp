# src/mcp

## OVERVIEW
Implements the MCP human-in-the-loop gate: policy matching, safe-to-display argument shaping, approval request/decision contracts, and denial errors.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|------|
| Main gate | `src/mcp/gate.ts` | `executeWithApproval(call, executor)` is the integration point |
| Policy rules | `src/mcp/policy.ts` | allowlist/denylist/per-tool overrides |
| Arg redaction/truncation | `src/mcp/redaction.ts` | emits `[REDACTED]`, `[TRUNCATED_*]` markers |
| Contracts | `src/mcp/types.ts` | stable request/decision payload; adapter interfaces |
| Error semantics | `src/mcp/errors.ts` | denial is an exception, not a successful tool result |

## CONVENTIONS
- `McpApprovalRequest` is the UI/logging contract; only put display-safe values in `displayArgs`.
- `traceId` must correlate request/decision/execution; do not reuse across calls.
- Policy precedence is part of the public behavior; changing it is a breaking change.

## ANTI-PATTERNS
- Never surface secrets in `summary` or logs; treat tool args as sensitive by default.
- Avoid node-specific dependencies in core logic; prefer injected `randomUUID`/`nowMs`.
- Do not accept non-`approve|deny` decisions; invalid decisions should fail fast.
