import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LAN origin allowed during `next dev` (kept for local cross-device testing).
  allowedDevOrigins: ["d4cf-85-87-0-193.ngrok-free.app"],
  // Production hardening.
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
