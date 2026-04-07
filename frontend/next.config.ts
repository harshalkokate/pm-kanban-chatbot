import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Proxy /api/* to the backend during `next dev` only.
  // The warning about rewrites not applying to static export is expected and harmless —
  // in Docker the frontend and backend share the same origin (FastAPI on :8000).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:8000/api/:path*" },
    ];
  },
};

export default nextConfig;
