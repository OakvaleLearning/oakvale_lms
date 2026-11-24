import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  async headers() {
    // The Android app (public/downloads, written by `npm run build:apk` in the
    // mobile app). Same file name every release, so browsers must recheck it.
    return [
      {
        source: "/downloads/:file*.apk",
        headers: [
          { key: "Content-Type", value: "application/vnd.android.package-archive" },
          { key: "Content-Disposition", value: 'attachment; filename="Oakvale-Learning.apk"' },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
  async redirects() {
    // Courses were renamed modules (and modules renamed topics).
    return [{ source: "/admin/courses/:id", destination: "/admin/modules/:id", permanent: true }];
  },
};

// Proxies Vercel BotID's challenge script; see src/instrumentation-client.ts.
export default withBotId(nextConfig);
