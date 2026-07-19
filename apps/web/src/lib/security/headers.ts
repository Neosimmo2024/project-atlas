type HeaderEntry = {
  key: string;
  value: string;
};

function supabaseOrigin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy() {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const connectSources = ["'self'"];
  const supabase = supabaseOrigin();

  if (supabase) connectSources.push(supabase);
  if (isDevelopment) connectSources.push("http://127.0.0.1:*", "http://localhost:*", "ws:", "wss:");

  const scriptSources = ["'self'", "'unsafe-inline'"];
  if (isDevelopment) scriptSources.push("'unsafe-eval'");

  const directives = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ["object-src", "'none'"],
    ["script-src", ...scriptSources],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'", "data:"],
    ["connect-src", ...connectSources],
    ["frame-src", "'none'"]
  ];

  return directives.map((directive) => directive.join(" ")).join("; ");
}

export function buildSecurityHeaders(): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "X-DNS-Prefetch-Control", value: "off" }
  ];

  if (process.env.VERCEL_ENV === "production" || process.env.ATLAS_ENABLE_HSTS === "true") {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }

  return headers;
}

export function applySecurityHeaders(headers: Headers) {
  for (const header of buildSecurityHeaders()) {
    headers.set(header.key, header.value);
  }
}
