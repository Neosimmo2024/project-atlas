export function safePersonReturnTo(value: string) {
  if (!value) return "/people";

  try {
    const parsed = new URL(value, "http://atlas.local");
    if (parsed.origin !== "http://atlas.local") return "/people";
    if (!/^\/relationships\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(parsed.pathname)) return "/people";

    const nestedReturnTo = parsed.searchParams.get("returnTo");
    if (!nestedReturnTo) return parsed.pathname;

    const nested = new URL(nestedReturnTo, "http://atlas.local");
    if (nested.origin !== "http://atlas.local" || nested.pathname !== "/pipeline") return parsed.pathname;

    return `${parsed.pathname}?returnTo=${encodeURIComponent(`${nested.pathname}${nested.search}`)}`;
  } catch {
    return "/people";
  }
}
