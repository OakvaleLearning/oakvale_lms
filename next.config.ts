import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  async redirects() {
    // Courses were renamed modules (and modules renamed topics).
    return [{ source: "/admin/courses/:id", destination: "/admin/modules/:id", permanent: true }];
  },
};

// Proxies Vercel BotID's challenge script; see src/instrumentation-client.ts.
export default withBotId(nextConfig);
