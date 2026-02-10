export type ArgRedactionRule =
  | { kind: "redactKey"; key: string; replacement?: string }
  | { kind: "truncateString"; maxLen: number };

export type ArgDisplayOptions = {
  maxDepth: number;
  maxStringLen: number;
  maxArrayLen: number;
  maxObjectKeys: number;
  rules: ArgRedactionRule[];
};

const DEFAULT_REPLACEMENT = "[REDACTED]";

export function defaultArgDisplayOptions(): ArgDisplayOptions {
  return {
    maxDepth: 4,
    maxStringLen: 500,
    maxArrayLen: 50,
    maxObjectKeys: 50,
    rules: [
      { kind: "redactKey", key: "apiKey" },
      { kind: "redactKey", key: "token" },
      { kind: "redactKey", key: "password" }
    ]
  };
}

export function prepareArgsForDisplay(
  input: unknown,
  opts: ArgDisplayOptions
): unknown {
  return walk(input, opts, 0);
}

function walk(value: unknown, opts: ArgDisplayOptions, depth: number): unknown {
  if (depth > opts.maxDepth) return "[TRUNCATED_DEPTH]";

  if (typeof value === "string") {
    return truncateString(value, opts.maxStringLen);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    const sliced = value.slice(0, opts.maxArrayLen);
    const mapped = sliced.map((v) => walk(v, opts, depth + 1));
    if (value.length > sliced.length) mapped.push("[TRUNCATED_ARRAY]");
    return mapped;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const keys = Object.keys(obj).slice(0, opts.maxObjectKeys);
    for (const key of keys) {
      const redacted = applyKeyRedactions(key, opts.rules);
      if (redacted !== undefined) {
        out[key] = redacted;
        continue;
      }
      out[key] = walk(obj[key], opts, depth + 1);
    }
    if (Object.keys(obj).length > keys.length) out["__truncated__"] = true;
    return out;
  }
  return "[UNSERIALIZABLE]";
}

function applyKeyRedactions(
  key: string,
  rules: ArgRedactionRule[]
): string | undefined {
  for (const rule of rules) {
    if (rule.kind !== "redactKey") continue;
    if (key !== rule.key) continue;
    return rule.replacement ?? DEFAULT_REPLACEMENT;
  }
  return undefined;
}

function truncateString(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen) + "...[TRUNCATED]";
}
