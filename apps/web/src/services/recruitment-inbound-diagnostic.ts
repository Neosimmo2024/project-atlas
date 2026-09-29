/** QA-only evidence collection. These headers are untrusted, never authorization. */
export function collectInboundDiagnostic(sequenceId: string, headers: unknown, now = Date.now()) {
  const expires = Date.parse(process.env.ATLAS_INBOUND_DIAGNOSTIC_UNTIL ?? "");
  if (process.env.VERCEL_ENV !== "preview"
    || process.env.VERCEL_PROJECT_ID !== "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon"
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://mahgxumwucxehsooijag.supabase.co"
    || process.env.ATLAS_INBOUND_DIAGNOSTIC_SEQUENCE_ID !== sequenceId
    || !Number.isFinite(expires) || expires <= now || expires - now > 60 * 60 * 1000) return null;

  const evidence: Record<string, string[]> = {};
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    for (const [name, value] of Object.entries(headers)) {
      const key = name.toLowerCase();
      if (!["authentication-results", "arc-authentication-results", "received-spf"].includes(key)) continue;
      const values = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string");
      evidence[key] ??= [];
      for (const text of values) {
        if (evidence[key].length >= 2) break;
        evidence[key].push(text.slice(0, 2048));
      }
    }
  }
  return {
    version: 1,
    trust: "unverified_email_headers",
    captured_at: new Date(now).toISOString(),
    headers: evidence,
  };
}
