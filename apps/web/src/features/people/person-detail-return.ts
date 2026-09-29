const UUID_SEGMENT = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const RELATIONSHIP_PATH = new RegExp(`^/relationships/${UUID_SEGMENT}$`);
const ORGANIZATION_PATH = new RegExp(`^/organizations/${UUID_SEGMENT}$`);

function safeRelationshipReturnTo(parsed: URL) {
  if (parsed.origin !== "http://atlas.local" || !RELATIONSHIP_PATH.test(parsed.pathname)) return null;

  const nestedReturnTo = parsed.searchParams.get("returnTo");
  if (!nestedReturnTo) return parsed.pathname;

  const nested = new URL(nestedReturnTo, "http://atlas.local");
  if (nested.origin !== "http://atlas.local" || nested.pathname !== "/pipeline") return parsed.pathname;

  return `${parsed.pathname}?returnTo=${encodeURIComponent(`${nested.pathname}${nested.search}`)}`;
}

export function safePersonReturnTo(value: string) {
  if (!value) return "/people";

  try {
    const parsed = new URL(value, "http://atlas.local");
    const relationshipReturnTo = safeRelationshipReturnTo(parsed);
    if (relationshipReturnTo) return relationshipReturnTo;

    if (parsed.origin !== "http://atlas.local" || !ORGANIZATION_PATH.test(parsed.pathname)) return "/people";

    const nestedReturnTo = parsed.searchParams.get("returnTo");
    if (!nestedReturnTo) return parsed.pathname;

    const nested = new URL(nestedReturnTo, "http://atlas.local");
    const nestedRelationshipReturnTo = safeRelationshipReturnTo(nested);
    if (!nestedRelationshipReturnTo) return parsed.pathname;

    return `${parsed.pathname}?returnTo=${encodeURIComponent(nestedRelationshipReturnTo)}`;
  } catch {
    return "/people";
  }
}
