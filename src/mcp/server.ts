import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  ASK_USER_OPTION_LIMIT,
  type AskUserToolInput
} from "./ask-user.js";
import {
  defaultAskUserBridgePath,
  enqueueAskUserPrompt,
  waitForAskUserResponse
} from "./ask-user-bridge.js";
import { autolaunchAskUserResponder } from "./ask-user-autolaunch.js";

const ASK_USER_TIMEOUT_MS = 5 * 60 * 1000;

const AskUserOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional()
});

export function createHandraiseMcpServer(): McpServer {
  const server = new McpServer({
    name: "raisehand",
    version: "0.1.0"
  });

  server.registerTool(
    "handraise_ask_user",
    {
      title: "Ask user",
      description:
        "Primary human-input tool for AI agents. Ask one clear question, optionally include readyAnswers for quick one-tap picks, and optionally allow custom text. The reply is collected through the raisehand TUI/CLI responder and returned as structured output without requiring a new chat message.",
      inputSchema: {
        header: z.string().optional(),
        question: z.string().min(1),
        options: z.array(AskUserOptionSchema).max(ASK_USER_OPTION_LIMIT).optional(),
        readyAnswers: z.array(AskUserOptionSchema).max(ASK_USER_OPTION_LIMIT).optional(),
        multiple: z.boolean().optional(),
        custom: z.boolean().optional(),
        customLabel: z.string().optional(),
        waitTimeoutMs: z.number().int().positive().max(60 * 60 * 1000).optional()
      }
    },
    async ({ header, question, options, readyAnswers, multiple, custom, customLabel, waitTimeoutMs }) => {
      const askInput: AskUserToolInput = { question };
      if (header !== undefined) askInput.header = header;
      if (options !== undefined) askInput.options = options;
      if (readyAnswers !== undefined) askInput.readyAnswers = readyAnswers;
      if (multiple !== undefined) askInput.multiple = multiple;
      if (custom !== undefined) askInput.custom = custom;
      if (customLabel !== undefined) askInput.customLabel = customLabel;

      const resolvedTimeoutMs = resolveAskUserTimeoutMs(waitTimeoutMs);
      return askUserViaCliBridge(askInput, resolvedTimeoutMs);
    }
  );

  return server;
}

export async function runHandraiseMcpServer(): Promise<void> {
  const server = createHandraiseMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("raisehand MCP server connected via stdio");

  const askCliScriptPath = fileURLToPath(new URL("./ask-user-cli.js", import.meta.url));
  const launchResult = await autolaunchAskUserResponder({
    nodePath: process.execPath,
    scriptPath: askCliScriptPath
  });
  if (launchResult.launched) {
    console.error(`[raisehand] ask responder autolaunched: ${launchResult.command}`);
  } else {
    console.error(`[raisehand] ask responder autolaunch skipped: ${launchResult.reason}`);
  }
}

async function askUserViaCliBridge(
  askInput: AskUserToolInput,
  waitTimeoutMs: number
): Promise<{
  content: [{ type: "text"; text: string }];
  structuredContent: {
    action: "accept" | "decline" | "cancel";
    answer: string | string[] | null;
    selectedOptions?: string[];
    customResponse?: string;
    statePath?: string;
  };
}> {
  const statePath = defaultAskUserBridgePath();
  const promptId = randomUUID();

  try {
    await enqueueAskUserPrompt(statePath, {
      id: promptId,
      createdAt: new Date().toISOString(),
      ...askInput
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not enqueue askUser prompt.";
    return {
      content: [{ type: "text", text: message }],
      structuredContent: {
        action: "cancel",
        answer: null,
        statePath
      }
    };
  }

  let response;
  try {
    response = await waitForAskUserResponse(statePath, promptId, waitTimeoutMs);
  } catch {
    return {
      content: [
        {
          type: "text",
          text:
            "Timed out waiting for CLI askUser response. Start responder with: npm run ask-cli:start"
        }
      ],
      structuredContent: {
        action: "cancel",
        answer: null,
        statePath
      }
    };
  }

  if (response.action !== "accept") {
    return {
      content: [
        {
          type: "text",
          text: `User ${response.action} the askUser prompt via CLI bridge.`
        }
      ],
      structuredContent: {
        action: response.action,
        answer: null,
        statePath
      }
    };
  }

  return {
    content: [
      {
        type: "text",
        text: "Collected user input via CLI ask bridge."
      }
    ],
    structuredContent: {
      action: "accept",
      answer: response.answer ?? null,
      ...(response.selectedOptions !== undefined ? { selectedOptions: response.selectedOptions } : {}),
      ...(response.customResponse !== undefined ? { customResponse: response.customResponse } : {}),
      statePath
    }
  };
}

function resolveAskUserTimeoutMs(input: number | undefined): number {
  if (typeof input === "number" && Number.isFinite(input) && input > 0) return input;
  const env = process.env.HANDRAISE_ASK_USER_TIMEOUT_MS;
  if (!env) return ASK_USER_TIMEOUT_MS;
  const parsed = Number.parseInt(env, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return ASK_USER_TIMEOUT_MS;
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHandraiseMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
