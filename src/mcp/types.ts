export type McpToolName = string;

export type McpToolArgs = unknown;

export type McpToolCall = {
  toolName: McpToolName;
  args: McpToolArgs;
};

export type McpToolExecutor<TResult = unknown> = (
  call: McpToolCall
) => Promise<TResult>;

export type McpRiskClass = "low" | "medium" | "high";

export type McpApprovalRequest = {
  traceId: string;
  toolName: McpToolName;
  summary: string;
  risk: McpRiskClass;
  displayArgs: unknown;
  createdAtMs: number;
};

export type McpApprovalDecision =
  | {
      decision: "approve";
      overrideArgs?: McpToolArgs;
    }
  | {
      decision: "deny";
      reason?: string;
    };

export type HandraiseAdapter = {
  requestApproval: (req: McpApprovalRequest) => Promise<McpApprovalDecision>;
};

export type McpHumanInLoopLogger = {
  info: (event: string, payload: Record<string, unknown>) => void;
  warn: (event: string, payload: Record<string, unknown>) => void;
};
