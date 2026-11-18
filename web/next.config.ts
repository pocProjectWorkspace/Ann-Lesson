import type { NextConfig } from "next";

// Comma-separated list of public hostnames the app is served from, e.g.
// "app.example.com,www.example.com". Server actions refuse other origins.
const allowedOrigins = process.env.APP_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);

// Uploads stream through /api/uploads, which the proxy guards, so the proxy body cap must
// sit above MAX_UPLOAD_MB (default 500). Without this Next.js truncates bodies at 10 MB.
const uploadCapMb = Number(process.env.MAX_UPLOAD_MB ?? process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 500) || 500;

// Development only: hostnames (not URLs) that may load the dev server's scripts,
// e.g. your LAN address when a phone running Expo Go or the mobile web build opens
// the book viewer through it. Without this Next.js blocks /_next/* for other hosts
// and the embedded viewer stays on "Opening book…". Ignored in production.
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
  experimental: {
    proxyClientMaxBodySize: `${uploadCapMb + 50}mb`,
    serverActions: {
      // Files no longer pass through server actions, so the default-sized body is enough.
      bodySizeLimit: "2mb",
      ...(allowedOrigins?.length ? { allowedOrigins } : {}),
    },
  },
  turbopack: {
    // Pin the workspace root to this app. With lockfiles in both web/ and mobile/, Next
    // otherwise infers the repository root and watches files outside the app.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
