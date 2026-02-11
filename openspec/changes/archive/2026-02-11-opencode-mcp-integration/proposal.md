## Why

This repository already provides a policy-driven human approval gate for MCP tool calls, but it does not yet provide a complete, documented path for using it as an MCP server integration through local OpenCode configuration in this workspace.
We need a first-class integration flow so teams can build the project, connect it from local `opencode.json`, and reliably use that MCP integration in day-to-day OpenCode runs.

## What Changes

- Define an end-to-end integration path for using this project with OpenCode-local MCP configuration in the repository folder.
- Specify required runtime/build outputs and command conventions so MCP integration is usable after a standard local build.
- Define configuration requirements for connecting the built artifact from `opencode.json` and clarifying expected behavior at runtime.
- Add implementation tasks for code, config examples, and verification that the local MCP integration can be exercised from this workspace.

## Capabilities

### New Capabilities
- `opencode-mcp-integration`: Provide a complete and verifiable local integration path that lets OpenCode use this project as an MCP integration via repository-local configuration.

### Modified Capabilities

<!-- None. -->

## Impact

- Affected code/modules: MCP integration surface in `src/`, build/package configuration at project root, and OpenSpec artifacts under `openspec/changes/opencode-mcp-integration/`.
- Developer workflows: local build and run instructions must align with OpenCode MCP configuration expectations.
- Risk: integration failures from mismatched build outputs or config shape; mitigated by explicit requirements and test/verification tasks.
