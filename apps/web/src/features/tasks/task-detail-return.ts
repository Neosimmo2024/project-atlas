export function safeTaskReturnTo(value: string) {
  if (!value) return "/tasks";

  try {
    const parsed = new URL(value, "http://atlas.local");
    if (parsed.origin !== "http://atlas.local") return "/tasks";
    if (parsed.pathname !== "/action-plan") return "/tasks";

    const organizationId = parsed.searchParams.get("organizationId");
    if (!organizationId || !/^[a-zA-Z0-9_-]+$/.test(organizationId)) return "/tasks";

    return `/action-plan?organizationId=${encodeURIComponent(organizationId)}`;
  } catch {
    return "/tasks";
  }
}
