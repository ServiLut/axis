import type { NextConfig } from "next";
import { RETIRED_DASHBOARD_PATHS } from "./lib/psychology";

const chatwootUrl = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL;

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: '10mb' } },
  async redirects() {
    return RETIRED_DASHBOARD_PATHS.map((path) => ({
      source: `${path}/:path*`,
      destination: "/dashboard",
      permanent: false,
    }));
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.pravatar.cc",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/chatwoot-api/:path*",
        destination: `${chatwootUrl || "https://app.chatwoot.com"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
