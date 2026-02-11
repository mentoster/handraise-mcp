import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { createInterface } from "node:readline/promises";
import readline from "node:readline";
import boxen from "boxen";

import { normalizeOptionLabels, sanitizePromptText } from "./ask-user.js";
import {
  defaultAskUserBridgePath,
  listPendingAskUserPrompts,
  submitAskUserResponse,
  type AskUserBridgePrompt,
  type AskUserBridgeResponse
} from "./ask-user-bridge.js";

const POLL_INTERVAL_MS = 600;
const TUI_REFRESH_MS = 180;

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m"
} as const;

type PromptDraft = {
  markedOptionIndexes: Set<number>;
  activeRow: number;
};

type KeypressEvent = {
  key: readline.Key;
};

type TuiMode = "list" | "answer";

type AnswerRow =
  | { kind: "option"; label: string; optionIndex: number }
  | { kind: "submit"; label: string }
  | { kind: "decline"; label: string }
  | { kind: "cancel"; label: string };

export async function runAskUserCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const once = argv.includes("--once");
  const statePath = defaultAskUserBridgePath();
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY || !stdout.isTTY) {
    await runLegacyCliMode(statePath, once);
    return;
  }

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();

  let pending: AskUserBridgePrompt[] = [];
  let selectedIndex = 0;
  let footer = "Waiting for prompts...";
  let running = true;
  let busy = false;
  let handled = false;
  let mode: TuiMode = "list";
  const drafts = new Map<string, PromptDraft>();

  const onSignal = () => {
    running = false;
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    while (running) {
      if (!busy) {
        pending = await listPendingAskUserPrompts(statePath);
        pruneDrafts(drafts, pending);

        if (pending.length === 0) {
          selectedIndex = 0;
          if (mode === "answer") mode = "list";
          if (once && handled) break;
        } else if (selectedIndex >= pending.length) {
          selectedIndex = pending.length - 1;
        }
      }

      const active = pending[selectedIndex];
      renderTui(statePath, pending, selectedIndex, footer, once, mode, drafts, active);

      const event = await waitForKeypress(TUI_REFRESH_MS);
      if (!event || busy) continue;
      const key = event.key;

      if (key.ctrl && key.name === "c") {
        running = false;
        continue;
      }

      if (key.name === "escape") {
        if (mode === "answer") {
          mode = "list";
          footer = "Exited answer mode.";
        } else {
          running = false;
        }
        continue;
      }

      if (mode === "list") {
        switch (key.name) {
          case "down":
          {
            if (pending.length > 0) selectedIndex = (selectedIndex + 1) % pending.length;
            continue;
          }
          case "up":
          {
            if (pending.length > 0) selectedIndex = (selectedIndex - 1 + pending.length) % pending.length;
            continue;
          }
          case "return": {
            if (!active) continue;
            mode = "answer";
            const draft = getPromptDraft(drafts, active.id);
            draft.activeRow = 0;
            footer = `Answer mode for prompt ${active.id}.`;
            continue;
          }
          default:
            continue;
        }
      }

      if (!active) {
        mode = "list";
        continue;
      }

      const rows = getAnswerRows(active);
      const draft = getPromptDraft(drafts, active.id);
      draft.activeRow = clampIndex(draft.activeRow, rows.length);

      switch (key.name) {
        case "down":
        {
          draft.activeRow = (draft.activeRow + 1) % rows.length;
          continue;
        }
        case "up":
        {
          draft.activeRow = (draft.activeRow - 1 + rows.length) % rows.length;
          continue;
        }
        case "return": {
          const row = rows[draft.activeRow];
          if (!row) continue;

          if (row.kind === "option") {
            toggleMarkedOption(draft.markedOptionIndexes, row.optionIndex);
            footer = `Toggled option ${row.optionIndex + 1} for prompt ${active.id}.`;
            continue;
          }

          busy = true;
          let response: AskUserBridgeResponse;

          if (row.kind === "submit") {
            response = buildAcceptedResponse(active, draft);
          } else {
            response = {
              promptId: active.id,
              action: row.kind,
              respondedAt: new Date().toISOString()
            };
          }

          const stored = await submitAskUserResponse(statePath, response);
          busy = false;

          if (stored) {
            drafts.delete(active.id);
            handled = true;
            mode = "list";
          }

          footer = stored
            ? row.kind === "submit"
              ? `Submitted response for ${active.id}.`
              : `${capitalize(row.kind)}ed prompt ${active.id}.`
            : `Prompt ${active.id} disappeared before response.`;

          if (once && stored) running = false;
          continue;
        }
        default:
          continue;
      }
    }
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdout.write("\x1Bc");
  }
}

function renderTui(
  statePath: string,
  pending: AskUserBridgePrompt[],
  selectedIndex: number,
  footer: string,
  once: boolean,
  mode: TuiMode,
  drafts: Map<string, PromptDraft>,
  active: AskUserBridgePrompt | undefined
): void {
  process.stdout.write("\x1Bc");
  process.stdout.write(`${COLOR.bold}${COLOR.cyan}raisehand ask TUI${COLOR.reset}\n`);
  process.stdout.write(`${COLOR.gray}Bridge:${COLOR.reset} ${statePath}${once ? " (once mode)" : ""}\n\n`);
  process.stdout.write(`${renderHintsBox(mode)}\n\n`);

  if (pending.length === 0 || !active) {
    process.stdout.write(`${COLOR.gray}No pending prompts. Waiting...${COLOR.reset}\n\n`);
    process.stdout.write(`${COLOR.magenta}${footer}${COLOR.reset}\n`);
    return;
  }

  process.stdout.write(`${COLOR.bold}Pending prompts: ${pending.length}${COLOR.reset}\n`);
  for (let i = 0; i < Math.min(pending.length, 10); i += 1) {
    const prompt = pending[i]!;
    const title = sanitizePromptText(prompt.header) ?? prompt.question;
    const prefix = i === selectedIndex ? `${COLOR.yellow}>${COLOR.reset}` : " ";
    process.stdout.write(`${prefix} ${i + 1}. ${title}\n`);
  }

  process.stdout.write("\n----------------------------------------\n");
  process.stdout.write(`${COLOR.gray}Prompt id:${COLOR.reset} ${active.id}\n`);
  if (active.header) process.stdout.write(`${COLOR.bold}${active.header}${COLOR.reset}\n`);
  process.stdout.write(`${active.question}\n`);

  if (mode === "list") {
    const listPreview = buildAnswerRowPreview(active, getPromptDraft(drafts, active.id));
    process.stdout.write(`\n${renderPreviewBox(listPreview)}\n`);
    process.stdout.write(`\n${COLOR.green}Press Enter to open answer mode for selected prompt.${COLOR.reset}\n`);
    process.stdout.write(`\n${COLOR.magenta}${footer}${COLOR.reset}\n`);
    return;
  }

  const rows = getAnswerRows(active);
  const draft = getPromptDraft(drafts, active.id);
  draft.activeRow = clampIndex(draft.activeRow, rows.length);

  process.stdout.write(`\n${COLOR.bold}Answer Rows${COLOR.reset}\n`);
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const focused = i === draft.activeRow;
    const cursor = focused ? `${COLOR.yellow}>${COLOR.reset}` : " ";
    if (row.kind === "option") {
      const marked = draft.markedOptionIndexes.has(row.optionIndex);
      const mark = marked ? `${COLOR.green}[x]${COLOR.reset}` : `${COLOR.gray}[ ]${COLOR.reset}`;
      process.stdout.write(`${cursor} ${row.optionIndex + 1}. ${mark} ${row.label}\n`);
      continue;
    }

    const color = row.kind === "submit" ? COLOR.green : row.kind === "decline" ? COLOR.red : COLOR.yellow;
    process.stdout.write(`${cursor} ${color}${row.label}${COLOR.reset}\n`);
  }
  process.stdout.write(`\n${COLOR.magenta}${footer}${COLOR.reset}\n`);
}

function getAnswerRows(prompt: AskUserBridgePrompt): AnswerRow[] {
  const options = normalizeOptionLabels(prompt.options);
  const rows: AnswerRow[] = options.map((label, index) => ({
    kind: "option",
    label,
    optionIndex: index
  }));

  rows.push({ kind: "submit", label: "Submit answer" });
  rows.push({ kind: "decline", label: "Decline prompt" });
  rows.push({ kind: "cancel", label: "Cancel prompt" });
  return rows;
}

function getPromptDraft(drafts: Map<string, PromptDraft>, promptId: string): PromptDraft {
  const existing = drafts.get(promptId);
  if (existing) return existing;
  const created: PromptDraft = {
    markedOptionIndexes: new Set<number>(),
    activeRow: 0
  };
  drafts.set(promptId, created);
  return created;
}

function pruneDrafts(drafts: Map<string, PromptDraft>, pending: AskUserBridgePrompt[]): void {
  const activeIds = new Set(pending.map((prompt) => prompt.id));
  for (const key of drafts.keys()) {
    if (!activeIds.has(key)) drafts.delete(key);
  }
}

function buildAcceptedResponse(prompt: AskUserBridgePrompt, draft: PromptDraft): AskUserBridgeResponse {
  const options = normalizeOptionLabels(prompt.options);
  const selectedOptions = [...draft.markedOptionIndexes]
    .sort((a, b) => a - b)
    .map((index) => options[index])
    .filter((value): value is string => value !== undefined);

  return {
    promptId: prompt.id,
    action: "accept",
    answer: selectedOptions,
    selectedOptions,
    respondedAt: new Date().toISOString()
  };
}

function buildAnswerRowPreview(prompt: AskUserBridgePrompt, draft: PromptDraft): string {
  const rows = getAnswerRows(prompt);
  if (rows.length === 0) return "No answer rows";

  const activeRow = clampIndex(draft.activeRow, rows.length);
  return rows
    .map((row, index) => {
      const cursor = index === activeRow ? "=>" : "  ";
      if (row.kind === "option") {
        const mark = draft.markedOptionIndexes.has(row.optionIndex) ? "[x]" : "[ ]";
        return `${cursor} ${mark} ${row.label}`;
      }
      return `${cursor} ${row.label}`;
    })
    .join("\n");
}

function renderHintsBox(mode: TuiMode): string {
  const lines =
    mode === "list"
      ? ["UP/DOWN: choose prompt", "ENTER: open answer", "ESC: exit TUI"]
      : ["UP/DOWN: choose row", "ENTER: toggle/confirm", "ESC: back to prompts"];

  return boxen(lines.join("\n"), {
    borderStyle: "round",
    borderColor: "yellow",
    title: "Hint",
    padding: { top: 0, right: 1, bottom: 0, left: 1 }
  });
}

function renderPreviewBox(preview: string): string {
  return boxen(preview, {
    borderStyle: "round",
    borderColor: "green",
    title: "Answer Row Preview",
    padding: { top: 0, right: 1, bottom: 0, left: 1 }
  });
}

function toggleMarkedOption(indexes: Set<number>, index: number): void {
  if (indexes.has(index)) {
    indexes.delete(index);
    return;
  }
  indexes.add(index);
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

async function waitForKeypress(timeoutMs: number): Promise<KeypressEvent | undefined> {
  return new Promise((resolve) => {
    let done = false;

    const finish = (result: KeypressEvent | undefined) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      process.stdin.off("keypress", onKeypress);
      resolve(result);
    };

    const onKeypress = (_value: string, key: readline.Key) => {
      finish({ key });
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);

    process.stdin.on("keypress", onKeypress);
  });
}

async function runLegacyCliMode(statePath: string, once: boolean): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`[handraise ask cli] watching ${statePath}${once ? " (once mode)" : ""}`);
  console.log("Press Ctrl+C to stop.");

  try {
    while (true) {
      const pending = await listPendingAskUserPrompts(statePath);
      if (pending.length === 0) {
        if (once) return;
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const prompt = pending[0]!;
      const response = await collectPromptResponseLegacy(rl, prompt);
      const stored = await submitAskUserResponse(statePath, response);
      if (!stored) {
        console.log(`[handraise ask cli] prompt '${prompt.id}' no longer pending.`);
      }

      if (once) return;
    }
  } finally {
    rl.close();
  }
}

async function collectPromptResponseLegacy(
  rl: ReturnType<typeof createInterface>,
  prompt: AskUserBridgePrompt
): Promise<AskUserBridgeResponse> {
  console.log("\n----------------------------------------");
  console.log(`Prompt id: ${prompt.id}`);
  if (prompt.header) console.log(prompt.header);
  console.log(prompt.question);

  const optionLabels = normalizeOptionLabels(prompt.options);
  if (optionLabels.length > 0) {
    optionLabels.forEach((label, index) => {
      console.log(`  ${index + 1}. ${label}`);
    });
  }

  if (optionLabels.length === 0) {
    const raw = (await rl.question("Response (or /decline, /cancel): ")).trim();
    const action = parseActionShortcut(raw);
    if (action !== undefined) {
      return {
        promptId: prompt.id,
        action,
        respondedAt: new Date().toISOString()
      };
    }

    return {
      promptId: prompt.id,
      action: "accept",
      answer: raw,
      respondedAt: new Date().toISOString()
    };
  }

  const selectionRaw = (await rl.question("Selections (comma numbers, blank for none): ")).trim();
  const selectionAction = parseActionShortcut(selectionRaw);
  if (selectionAction !== undefined) {
    return {
      promptId: prompt.id,
      action: selectionAction,
      respondedAt: new Date().toISOString()
    };
  }

  const selectedOptions = parseOptionSelection(selectionRaw, optionLabels);

  return {
    promptId: prompt.id,
    action: "accept",
    answer: selectedOptions,
    selectedOptions,
    respondedAt: new Date().toISOString()
  };
}

function parseActionShortcut(value: string): "decline" | "cancel" | undefined {
  if (value === "/decline") return "decline";
  if (value === "/cancel") return "cancel";
  return undefined;
}

function parseOptionSelection(input: string, options: string[]): string[] {
  if (input.length === 0) return [];

  const parts = input.split(",");
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const index = Number.parseInt(part.trim(), 10);
    if (!Number.isFinite(index)) continue;
    const label = options[index - 1];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    selected.push(label);
  }

  return selected;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAskUserCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
