import type { ArgDisplayOptions } from "./redaction.js";
import { defaultArgDisplayOptions } from "./redaction.js";
import type { McpRiskClass, McpToolName } from "./types.js";

export type ToolRule = {
  toolName: McpToolName;
  requireApproval?: boolean;
  risk?: McpRiskClass;
  argDisplay?: Partial<ArgDisplayOptions>;
};

export type McpApprovalPolicy = {
  defaultRequireApproval: boolean;
  allowlist?: McpToolName[];
  denylist?: McpToolName[];
  tools?: ToolRule[];
};

export type PolicyMatch = {
  requireApproval: boolean;
  risk: McpRiskClass;
  argDisplay: ArgDisplayOptions;
};

export function defaultMcpApprovalPolicy(): McpApprovalPolicy {
  return {
    defaultRequireApproval: true,
    allowlist: [],
    denylist: [],
    tools: []
  };
}

export function matchPolicy(
  policy: McpApprovalPolicy,
  toolName: McpToolName
): PolicyMatch {
  if (policy.allowlist?.includes(toolName)) {
    return {
      requireApproval: false,
      risk: "low",
      argDisplay: defaultArgDisplayOptions()
    };
  }

  if (policy.denylist?.includes(toolName)) {
    return {
      requireApproval: true,
      risk: "high",
      argDisplay: defaultArgDisplayOptions()
    };
  }

  const rule = policy.tools?.find((t) => t.toolName === toolName);
  const requireApproval = rule?.requireApproval ?? policy.defaultRequireApproval;
  const risk: McpRiskClass = rule?.risk ?? (requireApproval ? "medium" : "low");
  const base = defaultArgDisplayOptions();
  const mergedArgDisplay = mergeArgDisplayOptions(base, rule?.argDisplay);

  return { requireApproval, risk, argDisplay: mergedArgDisplay };
}

function mergeArgDisplayOptions(
  base: ArgDisplayOptions,
  override?: Partial<ArgDisplayOptions>
): ArgDisplayOptions {
  if (!override) return base;
  return {
    ...base,
    ...override,
    rules: override.rules ?? base.rules
  };
}
