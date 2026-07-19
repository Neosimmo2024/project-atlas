const SECRET_KEY_PATTERN = /(password|secret|service[_-]?role|token|authorization|api[_-]?key|publishable[_-]?key|anon[_-]?key|cookie|set-cookie)/i;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const SUPABASE_KEY_PATTERN = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g;

export type LogContext = Record<string, unknown>;

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return value.replace(SUPABASE_KEY_PATTERN, "[REDACTED]").replace(UUID_PATTERN, "[UUID]");
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redact(value.message, seen)
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.map((entry) => redact(entry, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const redacted: LogContext = {};
    for (const [key, entry] of Object.entries(value)) {
      redacted[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(entry, seen);
    }
    return redacted;
  }

  return value;
}

export function redactValue(value: unknown): unknown {
  return redact(value, new WeakSet<object>());
}

export function logServerError(message: string, context: LogContext = {}) {
  console.error(message, redactValue(context));
}
