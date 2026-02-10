# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-10T16:13:42+03:00
**Commit:** 4f2d159
**Branch:** master

## OVERVIEW
TypeScript (ESM) library that provides a policy-driven human-in-the-loop approval gate for MCP tool calls, plus OpenSpec artifacts and OpenCode workflow definitions.

## STRUCTURE
```
./
├── src/                 # Library source
│   └── mcp/             # MCP approval gate, policy, redaction, errors
├── test/                # node:test tests (compiled to dist/test)
├── dist/                # tsc output (generated)
├── openspec/            # Spec-driven change artifacts (proposal/design/specs/tasks)
├── .opencode/           # OpenCode commands + skills (markdown), not runtime code
├── package.json         # build/test scripts and exports
└── tsconfig.json        # strict TS config (exactOptionalPropertyTypes enabled)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|------|
| Public library API | `src/index.ts` | Re-exports MCP gate modules |
| Approval gate logic | `src/mcp/gate.ts` | `createMcpHumanInLoopGate()` + `executeWithApproval()` |
| Policy matching | `src/mcp/policy.ts` | allowlist/denylist/per-tool rules, precedence |
| Safe arg display | `src/mcp/redaction.ts` | redaction + truncation; produces display-safe args |
| Types/contracts | `src/mcp/types.ts` | stable request/decision payload types |
| Errors | `src/mcp/errors.ts` | denied/invalid-decision errors |
| Tests | `test/gate.test.ts` | approval flow + redaction behavior |
| Tests | `test/policy.test.ts` | policy precedence behavior |
| Spec-driven change | `openspec/changes/mcp-human-in-loop/` | proposal/design/specs/tasks |
| OpenCode workflows | `.opencode/command/*.md` | command definitions for opsx flow |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `createMcpHumanInLoopGate` | function | `src/mcp/gate.ts` | Wrap executor with approval policy + handraise adapter |
| `matchPolicy` | function | `src/mcp/policy.ts` | Determine if a tool requires approval + display/risk defaults |
| `prepareArgsForDisplay` | function | `src/mcp/redaction.ts` | Produce redacted/truncated args for UI/logging |
| `McpApprovalRequest` | type | `src/mcp/types.ts` | Approval prompt payload contract |
| `McpApprovalDecision` | type | `src/mcp/types.ts` | Approve/deny (optional edits/reason) |
| `McpHumanApprovalDeniedError` | class | `src/mcp/errors.ts` | Thrown when approval is denied |

## CONVENTIONS
- ESM package (`"type": "module"`); import paths in TS use `.js` extensions to match emitted output.
- Keep runtime-agnostic boundaries: the gate injects `HandraiseAdapter` and a `logger` rather than importing app/runtime code.
- Policy precedence is stable: allowlist > denylist > tool rule > default.

## ANTI-PATTERNS (THIS PROJECT)
- Do not log raw tool args; use `displayArgs` from `prepareArgsForDisplay()`.
- Do not bypass policy checks by calling the executor directly when approval is required.
- Do not introduce Node-only imports into the core gate/policy unless explicitly needed; prefer injected adapters.

## COMMANDS
```bash
npm run build
npm test

# OpenSpec workflows (CLI installed separately)
openspec status --change "mcp-human-in-loop"
```

## NOTES
- TypeScript language server is not part of this repo setup; use `tsc` for typechecking.
- `dist/` is generated; tests run against `dist/test` using Node's built-in test runner.
