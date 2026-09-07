export function safePersonReturnTo(value: string) {
  if (!value) return "/people";

  try {
    const parsed = new URL(value, "http://atlas.local");
    if (parsed.origin !== "http://atlas.local") return "/people";
    if (!/^\/relationships\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(parsed.pathname)) return "/people";

    return parsed.pathname;
  } catch {
    return "/people";
  }
}
