import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/signup", destination: "/api/signup" },
      { source: "/login", destination: "/api/login" },
      { source: "/auth/supabase-sync", destination: "/api/auth/supabase-sync" },
      { source: "/auth/google", destination: "/api/auth/google" },
      { source: "/consultations", destination: "/api/consultations" },
      { source: "/consultations/:id", destination: "/api/consultations/:id" },
    ];
  },
};

export default nextConfig;
