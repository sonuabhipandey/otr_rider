import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is behind a login and reads the session, and the data changes with each upload,
  // so pages render per request. Cache Components / Partial Prefetching (template defaults) are off.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    // The repo root has its own lockfile (Supabase CLI); the app lives in /web.
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
