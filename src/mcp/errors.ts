export class McpHumanApprovalDeniedError extends Error {
  public readonly traceId: string;
  public readonly toolName: string;
  public readonly reason: string | undefined;

  constructor(opts: { traceId: string; toolName: string; reason: string | undefined }) {
    super(`MCP tool invocation denied: ${opts.toolName}`);
    this.name = "McpHumanApprovalDeniedError";
    this.traceId = opts.traceId;
    this.toolName = opts.toolName;
    this.reason = opts.reason;
  }
}

export class McpHumanApprovalInvalidDecisionError extends Error {
  constructor() {
    super("Invalid human approval decision");
    this.name = "McpHumanApprovalInvalidDecisionError";
  }
}
