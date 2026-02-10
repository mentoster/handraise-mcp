## Why

Agents can invoke MCP tools that have side effects (filesystem writes, network calls, account changes) without a clear, consistent “stop and confirm” checkpoint.
We need a first-class human-in-the-loop approval flow so risky MCP actions can be paused, reviewed, and either approved or denied without forcing a new chat turn.

## What Changes

- Add a human approval gate that can wrap selected MCP tool calls.
- Provide a standard prompt payload (what will happen, inputs, risk level) and a standard decision result (approve/deny + optional edits).
- Support policy controls (allowlist/denylist, per-tool rules) so teams can tune which actions require confirmation.
- Record an audit trail for approvals/denials (at least in logs / run transcripts).

## Capabilities

### New Capabilities
- `mcp-human-in-loop`: Require explicit human approval for configured MCP tool invocations, with a consistent request/response contract.

### Modified Capabilities

<!-- None. -->

## Impact

- Agent orchestration/runtime: needs a blocking checkpoint primitive compatible with MCP tool execution.
- Configuration surface: policy for which MCP tools/actions require approval.
- Developer ergonomics: clear UX for approval prompts and decision handling.
- Observability: structured logging/audit trail for approvals and denials.
