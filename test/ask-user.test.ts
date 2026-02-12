import assert from "node:assert/strict";
import test from "node:test";

import { buildAskUserFormRequest, parseAskUserAcceptedAnswer } from "../src/mcp/ask-user.js";

test("buildAskUserFormRequest defaults to freeform response", () => {
  const req = buildAskUserFormRequest({ question: "What should I do next?" });

  assert.equal(req.message, "What should I do next?");
  assert.equal(req.multiple, false);
  assert.equal(req.custom, true);
  assert.deepEqual(req.optionLabels, []);
  assert.deepEqual(req.requestedSchema, {
    type: "object",
    properties: {
      response: {
        type: "string",
        title: "Response"
      }
    },
    required: ["response"]
  });
});

test("buildAskUserFormRequest builds enum schema when options are provided", () => {
  const req = buildAskUserFormRequest({
    header: "Confirm",
    question: "Pick one option",
    options: [{ label: "Approve" }, { label: "Deny" }, { label: "Approve" }],
    custom: false
  });

  assert.equal(req.message, "Confirm\nPick one option\nOptions:\n- Approve\n- Deny");
  assert.deepEqual(req.optionLabels, ["Approve", "Deny"]);
  assert.deepEqual(req.requestedSchema, {
    type: "object",
    properties: {
      selection: {
        type: "string",
        title: "Selection",
        enum: ["Approve", "Deny"]
      }
    },
    required: ["selection"]
  });
});

test("buildAskUserFormRequest includes readyAnswers as selectable options", () => {
  const req = buildAskUserFormRequest({
    question: "Pick deployment strategy",
    readyAnswers: [{ label: "Canary" }, { label: "Blue/Green" }, { label: "Canary" }],
    custom: true
  });

  assert.equal(req.message, "Pick deployment strategy\nOptions:\n- Canary\n- Blue/Green");
  assert.deepEqual(req.optionLabels, ["Canary", "Blue/Green"]);
  assert.deepEqual(req.requestedSchema, {
    type: "object",
    properties: {
      selection: {
        type: "string",
        title: "Selection",
        enum: ["Canary", "Blue/Green"]
      },
      customResponse: {
        type: "string",
        title: "Custom response"
      }
    },
    required: []
  });
});

test("buildAskUserFormRequest merges options and readyAnswers without duplicates", () => {
  const req = buildAskUserFormRequest({
    question: "Choose action",
    options: [{ label: "Approve" }, { label: "Deny" }],
    readyAnswers: [{ label: "Deny" }, { label: "Need more logs" }],
    custom: false
  });

  assert.deepEqual(req.optionLabels, ["Approve", "Deny", "Need more logs"]);
  assert.deepEqual(req.requestedSchema, {
    type: "object",
    properties: {
      selection: {
        type: "string",
        title: "Selection",
        enum: ["Approve", "Deny", "Need more logs"]
      }
    },
    required: ["selection"]
  });
});

test("parseAskUserAcceptedAnswer returns trimmed freeform text", () => {
  const answer = parseAskUserAcceptedAnswer(
    { response: "  use canary deploy  " },
    { optionLabels: [], multiple: false, custom: true }
  );

  assert.deepEqual(answer, {
    answer: "use canary deploy",
    selectedOptions: []
  });
});

test("parseAskUserAcceptedAnswer prefers selected single option", () => {
  const answer = parseAskUserAcceptedAnswer(
    { selection: "Deny", customResponse: "Need more logs" },
    { optionLabels: ["Approve", "Deny"], multiple: false, custom: true }
  );

  assert.deepEqual(answer, {
    answer: "Deny",
    selectedOptions: ["Deny"],
    customResponse: "Need more logs"
  });
});

test("parseAskUserAcceptedAnswer supports custom-only single answer", () => {
  const answer = parseAskUserAcceptedAnswer(
    { customResponse: "Schedule maintenance window" },
    { optionLabels: ["Now", "Later"], multiple: false, custom: true }
  );

  assert.deepEqual(answer, {
    answer: "Schedule maintenance window",
    selectedOptions: [],
    customResponse: "Schedule maintenance window"
  });
});

test("parseAskUserAcceptedAnswer combines multiple selections and custom text", () => {
  const answer = parseAskUserAcceptedAnswer(
    { selection: ["Approve", "invalid", "Deny"], customResponse: "Escalate" },
    { optionLabels: ["Approve", "Deny"], multiple: true, custom: true }
  );

  assert.deepEqual(answer, {
    answer: ["Approve", "Deny", "Escalate"],
    selectedOptions: ["Approve", "Deny"],
    customResponse: "Escalate"
  });
});
