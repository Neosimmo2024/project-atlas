import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        // The middleware supplies the per-request CSP.
        headers: buildSecurityHeaders().filter((header) => header.key !== "Content-Security-Policy")
      }
    ];
  }
};

export default nextConfig;

