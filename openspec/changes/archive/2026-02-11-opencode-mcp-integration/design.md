## Context

The project currently ships a TypeScript library (`handraise`) with MCP approval-gate primitives under `src/mcp/` and build output in `dist/`, but it does not provide a complete local integration contract for OpenCode MCP usage from this repository.
Users need a predictable way to connect this project from local `opencode.json`, run a standard build, and use the MCP integration in the same workspace without manual guesswork.

Current constraints:
- Package is ESM and built with `tsc` (`npm run build`).
- Integration must preserve runtime-agnostic gate design (adapter injection, no hard OpenCode runtime coupling in core logic).
- Spec-driven workflow requires testable requirements and a concrete implementation task plan.

## Goals / Non-Goals

**Goals:**
- Define a stable local integration path for OpenCode MCP usage via repository-local configuration.
- Ensure build/runtime outputs required for OpenCode MCP execution are explicitly defined and verifiable.
- Provide implementation guidance that keeps the existing MCP gate architecture intact.
- Add verification steps proving integration works from this folder.

**Non-Goals:**
- Replacing the existing MCP policy/gate behavior.
- Redesigning OpenCode itself or introducing custom OpenCode schema behavior.
- Publishing a cloud-hosted MCP deployment workflow.

## Decisions

### Decision 1: Keep core `src/mcp/*` runtime-agnostic and add integration at boundaries
- Rationale: existing architecture explicitly injects adapter behavior and avoids runtime-specific coupling.
- Alternative considered: embed OpenCode-specific configuration handling directly in gate code.
- Why rejected: would leak environment concerns into core library and reduce reuse/testability.

### Decision 2: Standardize local build + config contract around repository outputs
- Rationale: user goal is "connect here in this folder"; build outputs and config references must be deterministic.
- Alternative considered: support ad-hoc invocation paths without documented build contract.
- Why rejected: increases integration drift and onboarding friction.

### Decision 3: Provide explicit `opencode.json` MCP wiring example(s)
- Rationale: integration success depends on exact config shape and local path semantics.
- Alternative considered: prose-only documentation with no concrete config snippets.
- Why rejected: ambiguous and error-prone for first-time setup.

### Decision 4: Gate apply-readiness on implementation tasks that include end-to-end verification
- Rationale: artifacts must translate directly into implementation work and proof.
- Alternative considered: task list that only covers code edits.
- Why rejected: misses integration validation and can leave change incomplete.

## Risks / Trade-offs

- [OpenCode config format drift] -> Mitigation: derive config examples from current official docs and keep examples isolated to integration docs/config templates.
- [Build output mismatch with configured MCP entrypoint] -> Mitigation: define required output path and add verification steps in tasks.
- [Overfitting to one local environment] -> Mitigation: use relative-path conventions and minimal environment assumptions.
- [Confusion between library usage and MCP server integration] -> Mitigation: clearly separate gate library API docs from OpenCode MCP integration docs.

## Migration Plan

1. Add/adjust integration-facing files (configuration examples, docs, and any required runtime entrypoints).
2. Build project and validate generated outputs match MCP entrypoint expectations.
3. Validate OpenCode can resolve and run the configured MCP integration from this repository folder.
4. Rollback strategy: revert integration-specific files while leaving existing core gate API unchanged.

## Open Questions

- Should repository-local `opencode.json` include a single canonical MCP profile or multiple environment-specific variants?
- Is a dedicated executable MCP entry file needed in this package, or is existing compiled output sufficient once documented?
