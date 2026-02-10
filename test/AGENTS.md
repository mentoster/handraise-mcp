# test

## OVERVIEW
Unit tests using Node's built-in `node:test` runner; compiled by `tsc` and executed from `dist/test`.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|------|
| Gate flow tests | `test/gate.test.ts` | approve executes, deny blocks, redaction applied |
| Policy tests | `test/policy.test.ts` | allowlist/denylist/tool-rule precedence |
| Test command | `package.json` | `npm test` runs `tsc` then `node --test dist/test` |

## CONVENTIONS
- Tests import from `../src/...` (TS) but will run against emitted JS after build.
- Prefer `assert/strict` and `assert.rejects` for error-path verification.

## ANTI-PATTERNS
- Do not rely on wall-clock randomness; inject `randomUUID`/`nowMs` in tests.
