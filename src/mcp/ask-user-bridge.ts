import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { AskUserToolInput } from "./ask-user.js";

export type AskUserBridgePrompt = AskUserToolInput & {
  id: string;
  createdAt: string;
};

export type AskUserBridgeResponse = {
  promptId: string;
  action: "accept" | "decline" | "cancel";
  answer?: string | string[];
  selectedOptions?: string[];
  customResponse?: string;
  respondedAt: string;
};

type AskUserBridgeState = {
  version: 1;
  prompts: AskUserBridgePrompt[];
  responses: AskUserBridgeResponse[];
};

const DEFAULT_POLL_INTERVAL_MS = 350;
const LOCK_TIMEOUT_MS = 3000;

export function defaultAskUserBridgePath(): string {
  const envPath = process.env.HANDRAISE_ASK_USER_STATE_PATH;
  if (typeof envPath === "string" && envPath.trim().length > 0) {
    return envPath.trim();
  }
  return "/tmp/handraise-ask-user-bridge.json";
}

export async function enqueueAskUserPrompt(
  filePath: string,
  prompt: AskUserBridgePrompt
): Promise<void> {
  await withStateLock(filePath, async (state) => {
    const pending = listPendingFromState(state);
    if (pending.length >= 1 && !pending.some((item) => item.id === prompt.id)) {
      throw new Error("Only one pending askUser prompt is allowed at a time.");
    }

    const exists = state.prompts.some((item) => item.id === prompt.id);
    if (!exists) state.prompts.push(prompt);
    return state;
  });
}

export async function listPendingAskUserPrompts(filePath: string): Promise<AskUserBridgePrompt[]> {
  return withStateLock(filePath, async (state) => {
    const pending = listPendingFromState(state);
    pending.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return pending;
  });
}

export async function submitAskUserResponse(
  filePath: string,
  response: AskUserBridgeResponse
): Promise<boolean> {
  return withStateLock(filePath, async (state) => {
    const hasPrompt = state.prompts.some((item) => item.id === response.promptId);
    if (!hasPrompt) return false;

    const existingIndex = state.responses.findIndex((item) => item.promptId === response.promptId);
    if (existingIndex >= 0) {
      state.responses[existingIndex] = response;
    } else {
      state.responses.push(response);
    }

    return true;
  });
}

export async function waitForAskUserResponse(
  filePath: string,
  promptId: string,
  timeoutMs: number,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
): Promise<AskUserBridgeResponse> {
  const deadline = Date.now() + Math.max(timeoutMs, pollIntervalMs);

  while (Date.now() <= deadline) {
    const response = await takeAskUserResponse(filePath, promptId);
    if (response) return response;
    await delay(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for CLI response for prompt '${promptId}'.`);
}

async function takeAskUserResponse(
  filePath: string,
  promptId: string
): Promise<AskUserBridgeResponse | undefined> {
  return withStateLock(filePath, async (state) => {
    const index = state.responses.findIndex((item) => item.promptId === promptId);
    if (index < 0) return undefined;

    const response = state.responses[index];
    if (!response) return undefined;

    state.responses.splice(index, 1);
    state.prompts = state.prompts.filter((item) => item.id !== promptId);
    return response;
  });
}

async function withStateLock<T>(
  filePath: string,
  mutator: (state: AskUserBridgeState) => Promise<T>
): Promise<T> {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error: unknown) {
      if (Date.now() >= deadline) throw error;
      await delay(30);
    }
  }

  try {
    const state = await readBridgeState(filePath);
    const result = await mutator(state);
    await writeBridgeState(filePath, state);
    return result;
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function readBridgeState(filePath: string): Promise<AskUserBridgeState> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AskUserBridgeState>;
    if (parsed.version !== 1) return emptyState();
    return {
      version: 1,
      prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
      responses: Array.isArray(parsed.responses) ? parsed.responses : []
    };
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return emptyState();
    return emptyState();
  }
}

function emptyState(): AskUserBridgeState {
  return { version: 1, prompts: [], responses: [] };
}

function listPendingFromState(state: AskUserBridgeState): AskUserBridgePrompt[] {
  const responded = new Set(state.responses.map((item) => item.promptId));
  return state.prompts.filter((item) => !responded.has(item.id));
}

async function writeBridgeState(filePath: string, state: AskUserBridgeState): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
  await rename(tempPath, filePath);
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === code;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
