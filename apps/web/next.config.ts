import type { NextConfig } from "next";

const apiProxyOrigin = process.env.API_PROXY_ORIGIN;

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["127.0.0.1"],
  // Serves the app under a sub-path (e.g. NEXT_BASE_PATH=/sao_dts) when the
  // LAN server shares Apache with other apps at that prefix.
  basePath: process.env.NEXT_BASE_PATH || undefined,
  async rewrites() {
    if (!apiProxyOrigin) return [];
    const target = apiProxyOrigin.replace(/\/+$/, "");
    return [
      { source: "/api/:path*", destination: `${target}/api/:path*` },
      { source: "/socket.io/:path*", destination: `${target}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
