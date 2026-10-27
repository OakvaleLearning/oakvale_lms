"use client";

import { useRouter } from "next/navigation";

/** "Show [20] per page": goes to the link for the chosen size (built on the server, back on page 1). */
export function PageSizeSelect({ value, options }: { value: number; options: { size: number; href: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-500">
      Show
      <select
        value={value}
        onChange={(e) => {
          const option = options.find((o) => String(o.size) === e.target.value);
          if (option) router.push(option.href);
        }}
        className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink-800 shadow-card outline-none hover:border-ink-300 focus:border-primary-500 focus:ring-3 focus:ring-primary-100"
      >
        {options.map((o) => (
          <option key={o.size} value={o.size}>
            {o.size}
          </option>
        ))}
      </select>
      per page
    </label>
  );
}
