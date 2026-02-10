# openspec

## OVERVIEW
OpenSpec spec-driven workflow artifacts: proposal/design/specs/tasks that define and track changes before/while implementing code.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|------|
| Workflow config | `openspec/config.yaml` | schema is `spec-driven` |
| Change artifacts | `openspec/changes/` | each change has proposal/design/specs/tasks |
| MCP HITL change | `openspec/changes/mcp-human-in-loop/` | specs + tasks for approval gate |

## CONVENTIONS
- Spec-driven schema expects: `proposal.md`, `design.md`, `specs/<capability>/spec.md`, and `tasks.md`.
- `tasks.md` is parsed; keep checkbox format `- [ ]` / `- [x]`.

## ANTI-PATTERNS
- Do not edit specs to match implementation after-the-fact without intent; specs are the contract.
