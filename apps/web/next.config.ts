import type { NextConfig } from "next";

// Signed-in and sign-in pages are not for search results. The header covers every route
// below without a layout per module.
const PRIVATE = [
  "dashboard", "overview", "attendance", "sites", "materials", "reports", "workers",
  "wages", "team", "export", "sign-in", "sign-up", "check-email", "invite", "auth"
];

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@alarsio/types"],
  async headers() {
    return PRIVATE.map((p) => ({
      source: `/${p}/:path*`,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]
    }));
  }
};

export default config;
