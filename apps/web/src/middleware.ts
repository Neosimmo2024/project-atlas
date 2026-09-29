import { type NextRequest } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/security/headers";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildContentSecurityPolicy(nonce);
  // Replace client-supplied values before Next.js renders any scripts.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

