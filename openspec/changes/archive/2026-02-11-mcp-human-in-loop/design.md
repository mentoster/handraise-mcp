## Context

This repo provides `handraise`, a checkpoint primitive for OpenCode that allows an agent to pause mid-run and wait for human input without starting a new chat turn.

In practice, agents can execute MCP tools that may have real-world side effects (filesystem writes, network calls, account changes). Today there is no consistent, configurable way to require a human decision before such tool invocations proceed.

Constraints:
- Human interaction must be possible mid-run (no “new turn” requirement).
- The approval mechanism must be policy-driven (not hardcoded per call site).
- The prompt/decision contract should be stable so downstream tooling (UI/logs/tests) can rely on it.
- MCP integration for this change MUST be implemented in TypeScript.

## Goals / Non-Goals

**Goals:**
- Provide a standard human approval gate that can wrap configured MCP tool invocations.
- Define a clear request/response contract for approvals (what is being asked, what decision was made).
- Make policy configuration straightforward (per-tool rules, allow/deny, default behavior).
- Ensure decisions are observable (structured logging / transcript entries).

**Non-Goals:**
- Replacing MCP itself or redefining MCP tool schemas.
- Providing a full UI implementation; this change focuses on the primitive/contract that UIs can render.
- Long-lived approval persistence across runs (e.g., “remember my choice forever”) beyond basic allowlisting.

## Decisions

- Use `handraise` as the blocking mechanism for human approval.
  - Rationale: it is purpose-built for mid-run waiting without a new chat turn.
  - Alternative: throw an error and ask for re-run with different config. Rejected because it breaks flow and loses context.

- Introduce an explicit approval payload shape.
  - Include: tool name, arguments (redacted/trimmed as needed), a human-readable summary, risk classification, and an idempotency/trace id.
  - Rationale: makes approvals reviewable and auditable, and enables consistent UI.
  - Alternative: pass raw MCP request only. Rejected because it lacks stable semantics and can be noisy/unsafe to display.

- Make gating policy declarative.
  - Policy supports: tool allowlist/denylist, “require approval for all tools”, and per-tool rules.
  - Rationale: avoids scattering checks across call sites and allows safe defaults.

- Implement MCP-facing pieces in TypeScript.
  - Rationale: aligns with the MCP TypeScript ecosystem and keeps types/contracts first-class.
  - Notes: prefer defining request/decision payload types as exported TS types; avoid stringly-typed JSON where possible.

- Default toward safety for unknown tools.
  - Unknown/unclassified tools require approval by default (configurable).
  - Rationale: future-proofing when new tools are introduced.

## Risks / Trade-offs

- Approval deadlocks (agent pauses but no human response) → Provide timeouts/cancellation paths and clear run-state.
- Excessive prompts for benign tools → Provide allowlist rules and tool risk classes.
- Sensitive arguments displayed to humans/logs → Support redaction and truncation rules in the approval payload.
- TypeScript-only requirement may constrain integration options → Keep a small, well-typed boundary for any non-TS components.
