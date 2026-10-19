import type { MetadataRoute } from "next";

/** Makes the learner app installable ("Add to Home Screen") on phones. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oakvale Learning",
    short_name: "Oakvale",
    description: "Self-paced, certified caregiving courses.",
    start_url: "/learn",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#3229a2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
