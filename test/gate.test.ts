import test from "node:test";
import assert from "node:assert/strict";

import { createMcpHumanInLoopGate } from "../src/mcp/gate.js";
import { McpHumanApprovalDeniedError } from "../src/mcp/errors.js";

test("approved tool executes", async () => {
  const gate = createMcpHumanInLoopGate({
    policy: { defaultRequireApproval: true },
    handraise: {
      async requestApproval() {
        return { decision: "approve" };
      }
    },
    randomUUID: () => "t1",
    nowMs: () => 0
  });

  const result = await gate.executeWithApproval(
    { toolName: "writeFile", args: { path: "/tmp/a", contents: "x" } },
    async (call) => {
      assert.equal(call.toolName, "writeFile");
      return "ok";
    }
  );

  assert.equal(result, "ok");
});

test("denied tool does not execute", async () => {
  const gate = createMcpHumanInLoopGate({
    policy: { defaultRequireApproval: true },
    handraise: {
      async requestApproval() {
        return { decision: "deny", reason: "no" };
      }
    },
    randomUUID: () => "t2",
    nowMs: () => 0
  });

  await assert.rejects(
    () =>
      gate.executeWithApproval(
        { toolName: "deleteFile", args: { path: "/tmp/a" } },
        async () => {
          throw new Error("should not run");
        }
      ),
    (err: unknown) => {
      assert.ok(err instanceof McpHumanApprovalDeniedError);
      assert.equal(err.traceId, "t2");
      assert.equal(err.toolName, "deleteFile");
      return true;
    }
  );
});

test("redaction applied to displayArgs", async () => {
  let displayArgs: unknown = undefined;

  const gate = createMcpHumanInLoopGate({
    policy: {
      defaultRequireApproval: true,
      tools: [
        {
          toolName: "callApi",
          argDisplay: { rules: [{ kind: "redactKey", key: "token" }] }
        }
      ]
    },
    handraise: {
      async requestApproval(req) {
        displayArgs = req.displayArgs;
        return { decision: "approve" };
      }
    },
    randomUUID: () => "t3",
    nowMs: () => 0
  });

  await gate.executeWithApproval(
    { toolName: "callApi", args: { token: "secret", nested: { token: "secret2" } } },
    async () => "ok"
  );

  assert.deepEqual(displayArgs, {
    token: "[REDACTED]",
    nested: { token: "[REDACTED]" }
  });
});
