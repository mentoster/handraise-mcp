import test from "node:test";
import assert from "node:assert/strict";

import { matchPolicy } from "../src/mcp/policy.js";

test("allowlist disables approval", () => {
  const m = matchPolicy(
    {
      defaultRequireApproval: true,
      allowlist: ["readFile"],
      denylist: [],
      tools: []
    },
    "readFile"
  );

  assert.equal(m.requireApproval, false);
});

test("denylist forces approval", () => {
  const m = matchPolicy(
    {
      defaultRequireApproval: false,
      allowlist: [],
      denylist: ["deleteFile"],
      tools: []
    },
    "deleteFile"
  );

  assert.equal(m.requireApproval, true);
  assert.equal(m.risk, "high");
});

test("per-tool rule overrides default", () => {
  const m = matchPolicy(
    {
      defaultRequireApproval: false,
      tools: [{ toolName: "writeFile", requireApproval: true, risk: "high" }]
    },
    "writeFile"
  );

  assert.equal(m.requireApproval, true);
  assert.equal(m.risk, "high");
});
