import type { ElicitRequestFormParams } from "@modelcontextprotocol/sdk/types.js";

export const ASK_USER_OPTION_LIMIT = 25;

export type AskUserOption = {
  label: string;
  description?: string | undefined;
};

export type AskUserToolInput = {
  header?: string;
  question: string;
  options?: AskUserOption[];
  multiple?: boolean;
  custom?: boolean;
  customLabel?: string;
};

export type AskUserAcceptedAnswer = {
  answer: string | string[];
  selectedOptions: string[];
  customResponse?: string;
};

type AskUserSchemaProperty = ElicitRequestFormParams["requestedSchema"]["properties"][string];

export function buildAskUserFormRequest(input: AskUserToolInput): {
  message: string;
  requestedSchema: ElicitRequestFormParams["requestedSchema"];
  optionLabels: string[];
  multiple: boolean;
  custom: boolean;
} {
  const header = sanitizePromptText(input.header);
  const question = sanitizePromptText(input.question);
  const optionLabels = normalizeOptionLabels(input.options);
  const multiple = input.multiple ?? false;
  const custom = input.custom ?? true;

  const messageLines = [header, question].filter((line): line is string => line !== undefined);
  if (optionLabels.length > 0) {
    messageLines.push("Options:");
    for (const option of optionLabels) {
      messageLines.push(`- ${option}`);
    }
  }

  const properties: Record<string, AskUserSchemaProperty> = {};
  const required: string[] = [];

  if (optionLabels.length === 0) {
    properties.response = {
      type: "string",
      title: "Response"
    };
    required.push("response");
  } else if (multiple) {
    properties.selection = {
      type: "array",
      title: "Selections",
      items: {
        type: "string",
        enum: optionLabels
      },
      minItems: custom ? 0 : 1
    };
    if (!custom) required.push("selection");
  } else {
    properties.selection = {
      type: "string",
      title: "Selection",
      enum: optionLabels
    };
    if (!custom) required.push("selection");
  }

  if (optionLabels.length > 0 && custom) {
    properties.customResponse = {
      type: "string",
      title: sanitizePromptText(input.customLabel) ?? "Custom response"
    };
  }

  return {
    message: messageLines.join("\n"),
    requestedSchema: {
      type: "object",
      properties,
      required
    },
    optionLabels,
    multiple,
    custom
  };
}

export function parseAskUserAcceptedAnswer(
  content: Record<string, string | number | boolean | string[]>,
  config: { optionLabels: string[]; multiple: boolean; custom: boolean }
): AskUserAcceptedAnswer {
  const optionSet = new Set(config.optionLabels);

  if (config.optionLabels.length === 0) {
    const responseValue = content.response;
    const text = typeof responseValue === "string" ? responseValue.trim() : "";
    return {
      answer: text,
      selectedOptions: []
    };
  }

  const selectedOptions = normalizeSelections(content.selection, optionSet, config.multiple);
  const customResponse =
    config.custom && typeof content.customResponse === "string"
      ? content.customResponse.trim() || undefined
      : undefined;

  if (config.multiple) {
    const combined = customResponse ? [...selectedOptions, customResponse] : selectedOptions;
    return {
      answer: combined,
      selectedOptions,
      ...(customResponse !== undefined ? { customResponse } : {})
    };
  }

  if (selectedOptions.length > 0) {
    return {
      answer: selectedOptions[0]!,
      selectedOptions,
      ...(customResponse !== undefined ? { customResponse } : {})
    };
  }

  return {
    answer: customResponse ?? "",
    selectedOptions,
    ...(customResponse !== undefined ? { customResponse } : {})
  };
}

export function sanitizePromptText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeOptionLabels(options: AskUserToolInput["options"]): string[] {
  if (!options) return [];

  const unique = new Set<string>();
  const normalized: string[] = [];

  for (const option of options) {
    const label = sanitizePromptText(option.label);
    if (!label || unique.has(label)) continue;
    unique.add(label);
    normalized.push(label);
  }

  return normalized;
}

function normalizeSelections(
  selection: string | number | boolean | string[] | undefined,
  optionSet: Set<string>,
  multiple: boolean
): string[] {
  if (multiple) {
    if (!Array.isArray(selection)) return [];
    const selected: string[] = [];
    for (const value of selection) {
      if (typeof value !== "string") continue;
      if (!optionSet.has(value)) continue;
      selected.push(value);
    }
    return selected;
  }

  if (typeof selection !== "string") return [];
  if (!optionSet.has(selection)) return [];
  return [selection];
}
