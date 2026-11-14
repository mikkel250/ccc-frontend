import type { NextConfig } from "next";
import { SECURITY_HEADERS_SOURCE, securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: SECURITY_HEADERS_SOURCE,
        headers: securityHeaders({
          isProduction: process.env.NODE_ENV === "production",
        }),
      },
    ];
  },
};

export default nextConfig;
