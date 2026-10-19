/** Central settings for the Oakvale LMS app. */

export const SITE = {
  name: "Oakvale Learning",
  tagline: "Self-paced Learning",
  email: "hello@oakvaleltd.com",
  address: "Lagos, Nigeria",
  // The marketing site (learners_portal) — "Back to site" links point here.
  marketingUrl: process.env.NEXT_PUBLIC_MARKETING_URL || "https://oakvaleltd.com",
};
