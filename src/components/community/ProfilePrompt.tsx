import Link from "next/link";
import { UserRound } from "lucide-react";

/** Nudge to add a photo and headline, shown until the profile has either. */
export function ProfilePrompt() {
  return (
    <Link href="/community/settings" className="card group flex items-start gap-3 p-4 transition-shadow hover:shadow-raised">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-700">
        <UserRound className="size-4" />
      </span>
      <span>
        <span className="block text-sm font-medium text-ink-900 group-hover:underline">Complete your profile</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">Add a photo and a line about yourself so others know who you are.</span>
      </span>
    </Link>
  );
}
