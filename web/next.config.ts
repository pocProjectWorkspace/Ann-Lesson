import type { NextConfig } from "next";

// Comma-separated list of public hostnames the app is served from, e.g.
// "app.example.com,www.example.com". Server actions refuse other origins.
const allowedOrigins = process.env.APP_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);

// Safety net only: /api/uploads is excluded from the proxy matcher so bodies are not
// buffered, but if a guarded path ever receives a large body this keeps it from being
// truncated at Next.js's 10 MB default.
const uploadCapMb = Number(process.env.MAX_UPLOAD_MB ?? process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 500) || 500;

// Development only: hostnames (not URLs) that may load the dev server's scripts,
// e.g. your LAN address when a phone running Expo Go or the mobile web build opens
// the book viewer through it. Without this Next.js blocks /_next/* for other hosts
// and the embedded viewer stays on "Opening book…". Ignored in production.
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);

// Origins allowed to embed the book viewer in an iframe (the mobile web build), in
// addition to the app itself. Native apps load the viewer top-level and are unaffected.
const embedOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (process.env.NODE_ENV !== "production") {
  // Development: the mobile web build runs on another local port (and on the LAN
  // address a phone uses), so let those frame the viewer without configuration.
  embedOrigins.push("http://localhost:*", "http://127.0.0.1:*", ...(allowedDevOrigins ?? []).map((h) => `http://${h}:*`));
}
const baseSecurityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      // Pages: never framed by other sites. The API sets its own headers per route.
      { source: "/((?!api/|embed/|_next/).*)", headers: [...baseSecurityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }] },
      // Embedded viewer: framed by the app and by the listed mobile web origins only.
      { source: "/embed/:path*", headers: [...baseSecurityHeaders, { key: "Content-Security-Policy", value: ["frame-ancestors 'self'", ...embedOrigins].join(" ") }] },
      { source: "/api/:path*", headers: baseSecurityHeaders },
    ];
  },
  ...(allowedDevOrigins?.length ? { allowedDevOrigins } : {}),
  experimental: {
    // Off because the persisted dev cache goes stale whenever next.config.ts or an
    // environment variable changes, and every page then reloads in a loop until
    // .next is deleted. Cold starts are a few seconds slower; nothing else changes.
    turbopackFileSystemCacheForDev: false,
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
