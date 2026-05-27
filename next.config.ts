import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LAN origin allowed during `next dev` (kept for local cross-device testing).
  allowedDevOrigins: ["192.168.1.157"],
  // Production hardening.
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
