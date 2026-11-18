import type { NextConfig } from "next";

// Comma-separated list of public hostnames the app is served from, e.g.
// "app.example.com,www.example.com". Server actions refuse other origins.
const allowedOrigins = process.env.APP_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Files no longer pass through server actions, so the default-sized body is enough.
      bodySizeLimit: "2mb",
      ...(allowedOrigins?.length ? { allowedOrigins } : {}),
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
