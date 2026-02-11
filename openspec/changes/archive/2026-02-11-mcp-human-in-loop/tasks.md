## 1. Policy And Contracts

- [x] 1.1 Define approval request/decision types (tool name, args/redaction, summary, risk class, trace id)
- [x] 1.2 Define configurable policy shape (default behavior, per-tool rules, allowlist/denylist)
- [x] 1.3 Add minimal redaction/truncation rules for displaying tool arguments safely
- [x] 1.4 Ensure MCP integration and all new contracts are implemented in TypeScript (exported types + runtime validation where needed)

## 2. Human Approval Gate

- [x] 2.1 Implement approval gate wrapper around MCP tool invocation path
- [x] 2.2 Integrate `handraise` to pause and await human decision mid-run
- [x] 2.3 Ensure denied decisions prevent tool execution and return a clear error/result

## 3. Observability And Audit

- [x] 3.1 Add structured logging/transcript entries for approval requested + approved/denied
- [x] 3.2 Ensure trace ids link request, decision, and tool invocation in logs

## 4. Tests And Docs

- [x] 4.1 Add unit tests for policy matching (allowlist/denylist/per-tool rules)
- [x] 4.2 Add tests for approval flow (approved executes, denied blocks, redaction applied)
- [x] 4.3 Document configuration and expected approval payload contract
