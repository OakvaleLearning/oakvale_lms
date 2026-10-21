import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// Proxies Vercel BotID's challenge script; see src/instrumentation-client.ts.
export default withBotId(nextConfig);
