import type {
  HandraiseAdapter,
  McpApprovalDecision,
  McpApprovalRequest,
  McpHumanInLoopLogger,
  McpToolCall,
  McpToolExecutor
} from "./types.js";
import { McpHumanApprovalDeniedError, McpHumanApprovalInvalidDecisionError } from "./errors.js";
import { prepareArgsForDisplay } from "./redaction.js";
import type { McpApprovalPolicy } from "./policy.js";
import { matchPolicy } from "./policy.js";

export type McpHumanInLoopGateOptions = {
  policy: McpApprovalPolicy;
  handraise: HandraiseAdapter;
  logger?: McpHumanInLoopLogger;
  nowMs?: () => number;
  randomUUID?: () => string;
  summarize?: (call: McpToolCall) => string;
};

export function createMcpHumanInLoopGate(opts: McpHumanInLoopGateOptions) {
  const nowMs = opts.nowMs ?? (() => Date.now());
  const randomUUID =
    opts.randomUUID ??
    (() => {
      const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
      if (!cryptoObj?.randomUUID) {
        // Avoid importing node:crypto to keep this library runtime-agnostic.
        return `trace_${Math.random().toString(16).slice(2)}_${nowMs()}`;
      }
      return cryptoObj.randomUUID();
    });

  const summarize =
    opts.summarize ??
    ((call) => {
      return `Run MCP tool '${call.toolName}'`;
    });

  async function executeWithApproval<TResult>(
    call: McpToolCall,
    executor: McpToolExecutor<TResult>
  ): Promise<TResult> {
    const match = matchPolicy(opts.policy, call.toolName);
    if (!match.requireApproval) return executor(call);

    const traceId = randomUUID();
    const displayArgs = prepareArgsForDisplay(call.args, match.argDisplay);

    const req: McpApprovalRequest = {
      traceId,
      toolName: call.toolName,
      summary: summarize(call),
      risk: match.risk,
      displayArgs,
      createdAtMs: nowMs()
    };

    opts.logger?.info("mcp_approval_requested", {
      traceId,
      toolName: call.toolName,
      risk: match.risk
    });

    const decision = await opts.handraise.requestApproval(req);
    assertValidDecision(decision);

    if (decision.decision === "deny") {
      opts.logger?.warn("mcp_approval_denied", {
        traceId,
        toolName: call.toolName,
        reason: decision.reason
      });
      throw new McpHumanApprovalDeniedError({
        traceId,
        toolName: call.toolName,
        reason: decision.reason
      });
    }

    opts.logger?.info("mcp_approval_approved", {
      traceId,
      toolName: call.toolName
    });

    const args = decision.overrideArgs ?? call.args;
    return executor({ ...call, args });
  }

  return { executeWithApproval };
}

function assertValidDecision(decision: McpApprovalDecision): void {
  if (decision.decision === "approve") return;
  if (decision.decision === "deny") return;
  throw new McpHumanApprovalInvalidDecisionError();
}
