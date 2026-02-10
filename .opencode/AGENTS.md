# .opencode

## OVERVIEW
OpenCode automation assets: markdown command definitions and workflow skills for OpenSpec-driven changes.

## STRUCTURE
```
.opencode/
├── command/          # Command specs (opsx-apply, opsx-ff, etc.)
├── skills/           # Skill definitions (SKILL.md per skill)
├── package.json      # Minimal dependency surface for OpenCode plugin types
└── bun.lock          # Bun lockfile for `.opencode` dependencies
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|------|
| Command behavior spec | `.opencode/command/*.md` | Defines CLI behavior/guardrails |
| Skill behavior spec | `.opencode/skills/**/SKILL.md` | OpenSpec workflows and prompts |
| Dependency surface | `.opencode/package.json` | currently depends on `@opencode-ai/plugin` |

## CONVENTIONS
- Keep `.opencode/` focused on workflow definitions; runtime library code lives in `src/`.

## ANTI-PATTERNS
- Do not commit secrets/credentials into workflow prompts.
- Avoid adding runtime code here unless the repo explicitly moves to a plugin-based architecture.
