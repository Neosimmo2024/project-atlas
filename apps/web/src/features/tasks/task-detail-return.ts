const UUID_SEGMENT = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const DETAIL_RETURN_PATH = new RegExp(`^/(?:people|relationships|organizations|interactions|projects)/${UUID_SEGMENT}$`);

export function safeTaskReturnTo(value: string) {
  if (!value) return "/tasks";

  try {
    const parsed = new URL(value, "http://atlas.local");
    if (parsed.origin !== "http://atlas.local") return "/tasks";

    if (parsed.pathname === "/tasks") return "/tasks";

    if (parsed.pathname === "/action-plan") {
      const organizationId = parsed.searchParams.get("organizationId");
      if (!organizationId || !/^[a-zA-Z0-9_-]+$/.test(organizationId)) return "/tasks";
      return `/action-plan?organizationId=${encodeURIComponent(organizationId)}`;
    }

    if (DETAIL_RETURN_PATH.test(parsed.pathname)) {
      return `${parsed.pathname}${parsed.search}`;
    }

    return "/tasks";
  } catch {
    return "/tasks";
  }
}
