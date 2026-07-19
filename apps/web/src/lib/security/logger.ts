const SECRET_KEY_PATTERN = /(password|secret|service[_-]?role|token|authorization|api[_-]?key|publishable[_-]?key|anon[_-]?key|cookie|set-cookie)/i;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const SUPABASE_KEY_PATTERN = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g;

export type LogContext = Record<string, unknown>;

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(SUPABASE_KEY_PATTERN, "[REDACTED]").replace(UUID_PATTERN, "[UUID]");
  }

  if (Array.isArray(value)) return value.map((entry) => redactValue(entry));

  if (value && typeof value === "object") {
    const redacted: LogContext = {};
    for (const [key, entry] of Object.entries(value)) {
      redacted[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redactValue(entry);
    }
    return redacted;
  }

  return value;
}

export function logServerError(message: string, context: LogContext = {}) {
  console.error(message, redactValue(context));
}
