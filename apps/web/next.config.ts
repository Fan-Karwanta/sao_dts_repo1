import type { NextConfig } from "next";

const apiProxyOrigin = process.env.API_PROXY_ORIGIN;

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["127.0.0.1"],
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
