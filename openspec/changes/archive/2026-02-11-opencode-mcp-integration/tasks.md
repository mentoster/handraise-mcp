## 1. Integration Contract Definition

- [ ] 1.1 Define the canonical repository-local OpenCode MCP registration shape and server naming convention for `opencode.json`.
- [ ] 1.2 Specify the MCP launch command contract (runtime, entrypoint path, and required environment placeholders).
- [ ] 1.3 Document secure configuration rules that avoid hardcoded secrets and use environment placeholder patterns.

## 2. Runtime and Build Alignment

- [ ] 2.1 Add or adjust runtime entrypoint wiring so the configured MCP command resolves to a built artifact in `dist/`.
- [ ] 2.2 Update package/build scripts as needed to guarantee the MCP entry artifact is produced by standard build workflow.
- [ ] 2.3 Validate that generated output paths and execution mode match the documented OpenCode MCP configuration.

## 3. Documentation and Examples

- [ ] 3.1 Add repository-local configuration examples showing how to connect this integration from `opencode.json` in this folder.
- [ ] 3.2 Update developer docs with setup, build, and run instructions for OpenCode MCP usage.
- [ ] 3.3 Clarify troubleshooting notes for common misconfiguration cases (missing build artifact, wrong path, missing env values).

## 4. Verification

- [ ] 4.1 Run build and test commands to verify integration changes do not regress existing behavior.
- [ ] 4.2 Perform an end-to-end local verification that OpenCode resolves and exposes the configured MCP integration tools.
- [ ] 4.3 Record verification evidence in change notes so implementation handoff is reproducible.
