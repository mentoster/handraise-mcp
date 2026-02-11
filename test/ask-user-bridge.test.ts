import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  enqueueAskUserPrompt,
  listPendingAskUserPrompts,
  submitAskUserResponse,
  waitForAskUserResponse
} from "../src/mcp/ask-user-bridge.js";

test("bridge allows only one pending prompt at a time", async () => {
  const statePath = join(tmpdir(), `handraise-bridge-${Date.now()}-1.json`);

  try {
    await enqueueAskUserPrompt(statePath, {
      id: "p1",
      createdAt: "2026-01-01T00:00:01.000Z",
      question: "first"
    });

    await assert.rejects(
      enqueueAskUserPrompt(statePath, {
        id: "p2",
        createdAt: "2026-01-01T00:00:02.000Z",
        question: "second"
      }),
      /Only one pending askUser prompt is allowed/
    );

    const pending = await listPendingAskUserPrompts(statePath);
    assert.deepEqual(pending.map((item) => item.id), ["p1"]);
  } finally {
    await rm(statePath, { force: true });
    await rm(`${statePath}.lock`, { recursive: true, force: true });
  }
});

test("bridge waits for and consumes responses", async () => {
  const statePath = join(tmpdir(), `handraise-bridge-${Date.now()}-2.json`);

  try {
    await enqueueAskUserPrompt(statePath, {
      id: "prompt-1",
      createdAt: "2026-01-01T00:00:01.000Z",
      question: "Pick one",
      options: [{ label: "A" }, { label: "B" }],
      custom: true
    });

    setTimeout(() => {
      void submitAskUserResponse(statePath, {
        promptId: "prompt-1",
        action: "accept",
        answer: "A",
        selectedOptions: ["A"],
        respondedAt: new Date().toISOString()
      });
    }, 30);

    const response = await waitForAskUserResponse(statePath, "prompt-1", 1000, 10);
    assert.equal(response.action, "accept");
    assert.equal(response.answer, "A");

    const pendingAfter = await listPendingAskUserPrompts(statePath);
    assert.equal(pendingAfter.length, 0);
  } finally {
    await rm(statePath, { force: true });
    await rm(`${statePath}.lock`, { recursive: true, force: true });
  }
});
