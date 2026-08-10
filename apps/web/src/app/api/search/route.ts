import { GLOBAL_SEARCH_MIN_QUERY_LENGTH, normalizeGlobalSearchQuery } from "@/features/global-search/global-search";
import { searchGlobally } from "@/repositories/global-search";
import { getTenantContext } from "@/repositories/tenant-context";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("query") ?? "";
  if (normalizeGlobalSearchQuery(query).length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) {
    return NextResponse.json({ data: null, minQueryLength: GLOBAL_SEARCH_MIN_QUERY_LENGTH }, { status: 400 });
  }

  const data = await searchGlobally(context, query);
  return NextResponse.json({ data });
}

