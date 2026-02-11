import process from "node:process";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { McpHumanApprovalDeniedError } from "./errors.js";
import { createMcpHumanInLoopGate } from "./gate.js";
import { defaultMcpApprovalPolicy, matchPolicy, type McpApprovalPolicy, type ToolRule } from "./policy.js";
import { prepareArgsForDisplay } from "./redaction.js";
import type { McpApprovalDecision, McpRiskClass, McpToolCall } from "./types.js";

const RISK_VALUES: readonly McpRiskClass[] = ["low", "medium", "high"];

export function createHandraiseMcpServer(): McpServer {
  const server = new McpServer({
    name: "handraise",
    version: "0.1.0"
  });

  server.registerTool(
    "handraise_preview_approval",
    {
      title: "Preview approval",
      description:
        "Evaluate whether a tool call requires human approval and return display-safe arguments.",
      inputSchema: {
        toolName: z.string().min(1),
        args: z.unknown(),
        summary: z.string().optional(),
        policy: z.unknown().optional()
      }
    },
    async ({ toolName, args, summary, policy }) => {
      const activePolicy = coercePolicy(policy, policyFromEnvironment());
      const match = matchPolicy(activePolicy, toolName);
      const displayArgs = prepareArgsForDisplay(args, match.argDisplay);

      return {
        content: [
          {
            type: "text",
            text: summaryText(
              summary,
              toolName,
              match.requireApproval,
              match.risk
            )
          }
        ],
        structuredContent: {
          toolName,
          requireApproval: match.requireApproval,
          risk: match.risk,
          displayArgs
        }
      };
    }
  );

  server.registerTool(
    "handraise_apply_decision",
    {
      title: "Apply decision",
      description:
        "Apply an approve or deny decision to a tool call and return the resulting execution outcome.",
      inputSchema: {
        toolName: z.string().min(1),
        args: z.unknown(),
        decision: z.enum(["approve", "deny"]),
        reason: z.string().optional(),
        overrideArgs: z.unknown().optional(),
        summary: z.string().optional(),
        policy: z.unknown().optional()
      }
    },
    async ({ toolName, args, decision, reason, overrideArgs, summary, policy }) => {
      const activePolicy = coercePolicy(policy, policyFromEnvironment());
      const gate = createMcpHumanInLoopGate({
        policy: activePolicy,
        handraise: {
          async requestApproval() {
            if (decision === "deny") {
              const denyDecision: McpApprovalDecision =
                reason !== undefined ? { decision: "deny", reason } : { decision: "deny" };
              return denyDecision;
            }

            const approveDecision: McpApprovalDecision =
              overrideArgs !== undefined
                ? {
                    decision: "approve",
                    overrideArgs
                  }
                : { decision: "approve" };
            return approveDecision;
          }
        },
        summarize: (call) => summary ?? `Run MCP tool '${call.toolName}'`
      });

      const call: McpToolCall = { toolName, args };

      try {
        const result = await gate.executeWithApproval(call, async (approvedCall) => {
          return {
            executed: true,
            toolName: approvedCall.toolName,
            args: approvedCall.args
          };
        });

        return {
          content: [
            {
              type: "text",
              text: `Approved and executed '${toolName}'.`
            }
          ],
          structuredContent: {
            approved: true,
            result
          }
        };
      } catch (error: unknown) {
        if (error instanceof McpHumanApprovalDeniedError) {
          return {
            content: [
              {
                type: "text",
                text: `Denied '${toolName}'.`
              }
            ],
            structuredContent: {
              approved: false,
              traceId: error.traceId,
              toolName: error.toolName,
              reason: error.reason
            }
          };
        }

        throw error;
      }
    }
  );

  return server;
}

export async function runHandraiseMcpServer(): Promise<void> {
  const server = createHandraiseMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("handraise MCP server connected via stdio");
}

function summaryText(
  summary: string | undefined,
  toolName: string,
  requireApproval: boolean,
  risk: "low" | "medium" | "high"
): string {
  const prefix = summary ?? `Run MCP tool '${toolName}'`;
  if (requireApproval) {
    return `${prefix}. Human approval required (${risk} risk).`;
  }

  return `${prefix}. Approval not required (${risk} risk).`;
}

function policyFromEnvironment(): McpApprovalPolicy {
  const defaultPolicy = defaultMcpApprovalPolicy();
  const defaultRequireApproval = readBooleanEnv(
    "HANDRAISE_DEFAULT_REQUIRE_APPROVAL",
    defaultPolicy.defaultRequireApproval
  );

  return {
    defaultRequireApproval,
    allowlist: readCsvEnv("HANDRAISE_ALLOWLIST"),
    denylist: readCsvEnv("HANDRAISE_DENYLIST"),
    tools: []
  };
}

function coercePolicy(input: unknown, fallback: McpApprovalPolicy): McpApprovalPolicy {
  if (!isRecord(input)) return fallback;

  const defaultRequireApproval =
    typeof input.defaultRequireApproval === "boolean"
      ? input.defaultRequireApproval
      : fallback.defaultRequireApproval;

  const allowlist = toStringArray(input.allowlist) ?? fallback.allowlist ?? [];
  const denylist = toStringArray(input.denylist) ?? fallback.denylist ?? [];
  const tools = toToolRules(input.tools);

  return {
    defaultRequireApproval,
    allowlist,
    denylist,
    tools
  };
}

function toToolRules(input: unknown): ToolRule[] {
  if (!Array.isArray(input)) return [];

  const rules: ToolRule[] = [];
  for (const item of input) {
    if (!isRecord(item)) continue;
    if (typeof item.toolName !== "string" || item.toolName.length === 0) continue;

    const rule: ToolRule = { toolName: item.toolName };

    if (typeof item.requireApproval === "boolean") {
      rule.requireApproval = item.requireApproval;
    }

    if (isRiskClass(item.risk)) {
      rule.risk = item.risk;
    }

    if (isRecord(item.argDisplay)) {
      const partial: Partial<ToolRule["argDisplay"]> = {};
      if (typeof item.argDisplay.maxDepth === "number") {
        partial.maxDepth = item.argDisplay.maxDepth;
      }
      if (typeof item.argDisplay.maxStringLen === "number") {
        partial.maxStringLen = item.argDisplay.maxStringLen;
      }
      if (typeof item.argDisplay.maxArrayLen === "number") {
        partial.maxArrayLen = item.argDisplay.maxArrayLen;
      }
      if (typeof item.argDisplay.maxObjectKeys === "number") {
        partial.maxObjectKeys = item.argDisplay.maxObjectKeys;
      }
      if (Array.isArray(item.argDisplay.rules)) {
        partial.rules = item.argDisplay.rules;
      }
      rule.argDisplay = partial;
    }

    rules.push(rule);
  }

  return rules;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = raw.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function readCsvEnv(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function isRiskClass(value: unknown): value is McpRiskClass {
  return typeof value === "string" && RISK_VALUES.includes(value as McpRiskClass);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHandraiseMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
