import type { NextConfig } from "next";

const chatwootUrl = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL;

const nextConfig: NextConfig = {
  output: "standalone",
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
