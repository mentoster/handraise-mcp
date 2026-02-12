import process from "node:process";
import { readdir } from "node:fs/promises";
import path from "node:path";
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
const WAITING_FOOTER = "Waiting for pending requests or reviews...";
const FILE_MATCH_LIMIT = 6;
const FILE_SCAN_LIMIT = 4000;
const SKIP_FILE_DIRS = new Set([".git", "node_modules", "dist"]);

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
  customResponse: string;
  activeFileMatch: number;
};

type KeypressEvent = {
  value: string;
  key: readline.Key;
};

type TuiMode = "list" | "answer";

type AnswerRow =
  | { kind: "option"; label: string; optionIndex: number }
  | { kind: "custom"; label: string }
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
  let footer = WAITING_FOOTER;
  let running = true;
  let busy = false;
  let handled = false;
  let mode: TuiMode = "list";
  let lastFrame = "";
  const drafts = new Map<string, PromptDraft>();
  const workspaceRoot = process.cwd();
  let workspaceFiles: string[] = [];
  let workspaceFilesReady = false;
  collectWorkspaceFiles(workspaceRoot, FILE_SCAN_LIMIT)
    .then((files) => {
      workspaceFiles = files;
      workspaceFilesReady = true;
    })
    .catch(() => {
      workspaceFiles = [];
      workspaceFilesReady = true;
    });

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
      lastFrame = renderTui(
        statePath,
        pending,
        selectedIndex,
        footer,
        once,
        mode,
        drafts,
        active,
        lastFrame,
        workspaceFiles,
        workspaceFilesReady
      );

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
            draft.activeFileMatch = 0;
            footer = `Answer mode for request ${active.id}.`;
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
      const selectedRow = rows[draft.activeRow];
      const fileTag = selectedRow?.kind === "custom"
        ? getFileTagSuggestions(draft.customResponse, workspaceFiles)
        : undefined;

      if (fileTag) {
        draft.activeFileMatch = clampIndex(draft.activeFileMatch, fileTag.matches.length);
      } else {
        draft.activeFileMatch = 0;
      }

      switch (key.name) {
        case "down":
        {
          if (selectedRow?.kind === "custom" && fileTag && fileTag.matches.length > 0) {
            draft.activeFileMatch = (draft.activeFileMatch + 1) % fileTag.matches.length;
            continue;
          }
          draft.activeRow = (draft.activeRow + 1) % rows.length;
          continue;
        }
        case "up":
        {
          if (selectedRow?.kind === "custom" && fileTag && fileTag.matches.length > 0) {
            draft.activeFileMatch = (draft.activeFileMatch - 1 + fileTag.matches.length) % fileTag.matches.length;
            continue;
          }
          draft.activeRow = (draft.activeRow - 1 + rows.length) % rows.length;
          continue;
        }
        case "backspace": {
          const row = rows[draft.activeRow];
          if (row?.kind !== "custom") continue;
          if (draft.customResponse.length === 0) continue;
          draft.customResponse = draft.customResponse.slice(0, -1);
          draft.activeFileMatch = 0;
          continue;
        }
        case "tab": {
          const row = rows[draft.activeRow];
          if (row?.kind !== "custom" || !fileTag || fileTag.matches.length === 0) continue;
          draft.customResponse = applyFileTagMatch(draft.customResponse, fileTag, draft.activeFileMatch);
          draft.activeFileMatch = 0;
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

          if (row.kind === "custom") {
            if (fileTag && fileTag.matches.length > 0) {
              draft.customResponse = applyFileTagMatch(draft.customResponse, fileTag, draft.activeFileMatch);
              draft.activeFileMatch = 0;
              footer = "Inserted file path into response.";
              continue;
            }

            if (isFreeformPrompt(active)) {
              busy = true;
              const response = buildAcceptedResponse(active, draft);
              const stored = await submitAskUserResponse(statePath, response);
              busy = false;

              if (stored) {
                drafts.delete(active.id);
                handled = true;
                mode = "list";
              }

              footer = stored
                ? `Submitted response for ${active.id}.`
                : `Request ${active.id} disappeared before response.`;

              if (once && stored) running = false;
              continue;
            }

            footer = `Editing custom response for prompt ${active.id}.`;
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
        {
          const row = rows[draft.activeRow];
          if (row?.kind !== "custom") continue;
          const text = sanitizeTypedInput(event.value, key);
          if (text === undefined) continue;
          draft.customResponse += text;
          draft.activeFileMatch = 0;
          continue;
        }
      }
    }
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    if (stdin.isTTY) stdin.setRawMode(false);
    stdout.write("\x1b[?25h\x1b[0m\n");
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
  active: AskUserBridgePrompt | undefined,
  previousFrame: string,
  workspaceFiles: string[],
  workspaceFilesReady: boolean
): string {
  let frame = "";
  frame += `${COLOR.bold}${COLOR.cyan}raisehand ask TUI${COLOR.reset}\n`;
  frame += `${COLOR.gray}Bridge:${COLOR.reset} ${statePath}${once ? " (once mode)" : ""}\n\n`;

  if (pending.length === 0 || !active) {
    frame += `${COLOR.magenta}${WAITING_FOOTER}${COLOR.reset}\n`;
    frame += `${COLOR.gray}No pending requests or reviews.${COLOR.reset}\n\n`;
    frame += `${renderHintsBox(mode)}\n`;
    return writeFrame(frame, previousFrame);
  }

  frame += `${COLOR.bold}Pending requests or reviews: ${pending.length}${COLOR.reset}\n`;
  for (let i = 0; i < Math.min(pending.length, 10); i += 1) {
    const prompt = pending[i]!;
    const title = sanitizePromptText(prompt.header) ?? prompt.question;
    const prefix = i === selectedIndex ? `${COLOR.yellow}>${COLOR.reset}` : " ";
    frame += `${prefix} ${i + 1}. ${title}\n`;
  }

  frame += "\n----------------------------------------\n";
  frame += `${COLOR.gray}Prompt id:${COLOR.reset} ${active.id}\n`;
  if (active.header) frame += `${COLOR.bold}${active.header}${COLOR.reset}\n`;
  frame += `${active.question}\n`;

  if (mode === "list") {
    frame += `\n${COLOR.green}Press Enter to open response for selected request.${COLOR.reset}\n`;
    frame += `\n${COLOR.magenta}${WAITING_FOOTER}${COLOR.reset}\n`;
    frame += `\n${renderHintsBox(mode)}\n`;
    return writeFrame(frame, previousFrame);
  }

  const rows = getAnswerRows(active);
  const draft = getPromptDraft(drafts, active.id);
  draft.activeRow = clampIndex(draft.activeRow, rows.length);

  frame += `\n${COLOR.bold}Response${COLOR.reset}\n`;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const focused = i === draft.activeRow;
    const cursor = focused ? `${COLOR.yellow}>${COLOR.reset}` : " ";
    if (row.kind === "option") {
      const marked = draft.markedOptionIndexes.has(row.optionIndex);
      const mark = marked ? `${COLOR.green}[x]${COLOR.reset}` : `${COLOR.gray}[ ]${COLOR.reset}`;
      frame += `${cursor} ${row.optionIndex + 1}. ${mark} ${row.label}\n`;
      continue;
    }

    if (row.kind === "custom") {
      const fileTag = getFileTagSuggestions(draft.customResponse, workspaceFiles);
      const activeMatch = clampIndex(draft.activeFileMatch, fileTag?.matches.length ?? 0);
      draft.activeFileMatch = activeMatch;
      frame += renderCustomResponseRow(row.label, draft.customResponse, focused, fileTag, activeMatch, workspaceFilesReady);
      continue;
    }

    const color = row.kind === "submit" ? COLOR.green : row.kind === "decline" ? COLOR.red : COLOR.yellow;
    frame += `${cursor} ${color}${row.label}${COLOR.reset}\n`;
  }
  frame += `\n${COLOR.magenta}${footer}${COLOR.reset}\n`;
  frame += `\n${renderHintsBox(mode)}\n`;
  return writeFrame(frame, previousFrame);
}

function writeFrame(frame: string, previousFrame: string): string {
  if (frame === previousFrame) return previousFrame;
  process.stdout.write(`\x1b[?25l\x1b[H\x1b[J${frame}`);
  return frame;
}

function getAnswerRows(prompt: AskUserBridgePrompt): AnswerRow[] {
  const options = normalizeOptionLabels(prompt.options, prompt.readyAnswers);
  if (options.length === 0) {
    return [{ kind: "custom", label: sanitizePromptText(prompt.customLabel) ?? "Response" }];
  }

  const rows: AnswerRow[] = options.map((label, index) => ({
    kind: "option",
    label,
    optionIndex: index
  }));

  const customAllowed = options.length === 0 || prompt.custom !== false;
  if (customAllowed) {
    rows.push({ kind: "custom", label: sanitizePromptText(prompt.customLabel) ?? "Custom response" });
  }

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
    activeRow: 0,
    customResponse: "",
    activeFileMatch: 0
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
  const options = normalizeOptionLabels(prompt.options, prompt.readyAnswers);
  const customResponse = sanitizePromptText(draft.customResponse);
  const selectedOptions = [...draft.markedOptionIndexes]
    .sort((a, b) => a - b)
    .map((index) => options[index])
    .filter((value): value is string => value !== undefined);

  if (options.length === 0) {
    return {
      promptId: prompt.id,
      action: "accept",
      answer: customResponse ?? "",
      respondedAt: new Date().toISOString()
    };
  }

  const multiple = prompt.multiple ?? false;

  if (multiple) {
    const answer = customResponse ? [...selectedOptions, customResponse] : selectedOptions;
    return {
      promptId: prompt.id,
      action: "accept",
      answer,
      selectedOptions,
      ...(customResponse !== undefined ? { customResponse } : {}),
      respondedAt: new Date().toISOString()
    };
  }

  const answer = selectedOptions.length > 0 ? selectedOptions[0]! : customResponse ?? "";

  return {
    promptId: prompt.id,
    action: "accept",
    answer,
    selectedOptions,
    ...(customResponse !== undefined ? { customResponse } : {}),
    respondedAt: new Date().toISOString()
  };
}

function renderHintsBox(mode: TuiMode): string {
  const lines =
    mode === "list"
      ? ["UP/DOWN: choose request", "ENTER: open response", "ESC: exit TUI"]
      : ["Type response, @ to tag file", "TAB/ENTER: insert file  ENTER: submit", "BACKSPACE: edit  ESC: back"];

  return boxen(lines.join("\n"), {
    borderStyle: "round",
    borderColor: "yellow",
    title: "Hint",
    padding: { top: 0, right: 1, bottom: 0, left: 1 }
  });
}

function renderCustomResponseRow(
  label: string,
  value: string,
  focused: boolean,
  fileTag: FileTagSuggestions | undefined,
  activeMatch: number,
  workspaceFilesReady: boolean
): string {
  const text = value.length > 0 ? value : `${COLOR.gray}<type here>${COLOR.reset}`;
  const body = boxen(text, {
    borderStyle: "round",
    borderColor: focused ? "green" : "gray",
    title: label,
    padding: { top: 0, right: 1, bottom: 0, left: 1 }
  });

  const prefix = focused ? `${COLOR.yellow}>${COLOR.reset} ` : "  ";
  let rendered = `${prefix}${body.split("\n").join("\n  ")}\n`;

  if (!focused || !fileTag) return rendered;

  if (fileTag.matches.length === 0) {
    const emptyText = workspaceFilesReady
      ? `${COLOR.gray}No file matches for @${fileTag.query}.${COLOR.reset}`
      : `${COLOR.gray}Indexing files...${COLOR.reset}`;
    const emptyBox = boxen(emptyText, {
      borderStyle: "round",
      borderColor: "gray",
      title: "File Tag",
      padding: { top: 0, right: 1, bottom: 0, left: 1 }
    });
    rendered += `  ${emptyBox.split("\n").join("\n  ")}\n`;
    return rendered;
  }

  const options = fileTag.matches
    .map((match, index) => `${index === activeMatch ? `${COLOR.yellow}>${COLOR.reset}` : " "} @${match}`)
    .join("\n");
  const matchBox = boxen(options, {
    borderStyle: "round",
    borderColor: "cyan",
    title: "File Tag Matches",
    padding: { top: 0, right: 1, bottom: 0, left: 1 }
  });
  rendered += `  ${matchBox.split("\n").join("\n  ")}\n`;
  return rendered;
}

type FileTagSuggestions = {
  tokenStart: number;
  tokenEnd: number;
  query: string;
  matches: string[];
};

function getFileTagSuggestions(value: string, workspaceFiles: string[]): FileTagSuggestions | undefined {
  const match = /(?:^|\s)@([^\s]*)$/.exec(value);
  if (!match) return undefined;

  const query = match[1] ?? "";
  const tokenEnd = value.length;
  const tokenStart = tokenEnd - query.length - 1;
  const normalizedQuery = query.toLowerCase();

  const matches = workspaceFiles
    .filter((filePath) => {
      if (normalizedQuery.length === 0) return true;
      return filePath.toLowerCase().includes(normalizedQuery);
    })
    .slice(0, FILE_MATCH_LIMIT);

  return { tokenStart, tokenEnd, query, matches };
}

function applyFileTagMatch(value: string, suggestions: FileTagSuggestions, activeMatch: number): string {
  const selected = suggestions.matches[activeMatch];
  if (!selected) return value;
  return `${value.slice(0, suggestions.tokenStart)}@${selected} `;
}

async function collectWorkspaceFiles(root: string, limit: number): Promise<string[]> {
  const output: string[] = [];
  const queue: string[] = [root];

  while (queue.length > 0 && output.length < limit) {
    const current = queue.shift();
    if (!current) break;

    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (output.length >= limit) break;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_FILE_DIRS.has(entry.name)) continue;
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const relativePath = path.relative(root, fullPath);
      if (relativePath.length === 0) continue;
      output.push(relativePath.split(path.sep).join("/"));
    }
  }

  return output.sort((a, b) => a.localeCompare(b));
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

    const onKeypress = (value: string, key: readline.Key) => {
      finish({ value, key });
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);

    process.stdin.on("keypress", onKeypress);
  });
}

function sanitizeTypedInput(value: string, key: readline.Key): string | undefined {
  if (key.ctrl || key.meta) return undefined;
  if (value.length === 0) return undefined;
  if (key.name === "return" || key.name === "backspace" || key.name === "escape") return undefined;
  if (value === "\u007f") return undefined;
  return value;
}

function isFreeformPrompt(prompt: AskUserBridgePrompt): boolean {
  return normalizeOptionLabels(prompt.options, prompt.readyAnswers).length === 0;
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

  const optionLabels = normalizeOptionLabels(prompt.options, prompt.readyAnswers);
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
