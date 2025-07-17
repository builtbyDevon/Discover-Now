import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverComponentsExternalPackages: [],
  },
  // Set default hostname to 127.0.0.1 instead of localhost
  hostname: '127.0.0.1',
  port: 3000,
};

export default nextConfig;
