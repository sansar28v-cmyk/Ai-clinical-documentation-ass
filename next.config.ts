import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/signup", destination: "/api/signup" },
      { source: "/login", destination: "/api/login" },
      { source: "/consultations", destination: "/api/consultations" },
      { source: "/consultations/:id", destination: "/api/consultations/:id" },
    ];
  },
};

export default nextConfig;
