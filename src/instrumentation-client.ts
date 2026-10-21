import { initBotId } from "botid/client/core";

// Vercel BotID: attaches an invisible bot check to these requests. Each route
// verifies it with guardAuthRequest (src/lib/request-guard.ts).
initBotId({
  protect: [
    { path: "/api/auth/signup", method: "POST" },
    { path: "/api/auth/login", method: "POST" },
    { path: "/api/auth/forgot-password", method: "POST" },
    { path: "/api/auth/reset-password", method: "POST" },
    { path: "/api/auth/verify-email/resend", method: "POST" },
  ],
});
