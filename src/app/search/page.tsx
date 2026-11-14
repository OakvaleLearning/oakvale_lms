import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { buildSearchIndex } from "@/lib/dashboard-search";
import { matchEntries, type SearchEntry } from "@/components/dashboard/search";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Search" };

/** Pages in the app matching `?q=`, grouped by section. Each result shows its relative link. */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";

  const session = await requireSession("/search");
  const variant = session.role === "ADMIN" ? "admin" : "learner";
  const results = query ? matchEntries(await buildSearchIndex(session, variant), query) : [];

  const sections = new Map<string, SearchEntry[]>();
  for (const entry of results) {
    sections.set(entry.section, [...(sections.get(entry.section) ?? []), entry]);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Search"
        title={query ? `Results for “${query}”` : "Search"}
        description={
          query
            ? `${results.length} ${results.length === 1 ? "page" : "pages"} found`
            : "Find pages, programmes and modules by name."
        }
      />

      <form action="/search" role="search" className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search pages</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search pages, programmes, modules"
            className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
          />
        </label>
        <button type="submit" className="h-10 rounded-lg bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700">
          Search
        </button>
      </form>

      {!query && <p className="text-sm text-ink-500">Try “certificates”, “community” or the name of a module.</p>}

      {query && results.length === 0 && (
        <EmptyState icon={Search} title={`Nothing matches “${query}”`}>
          Try fewer or different words. Search matches page names, programme titles and keywords.
        </EmptyState>
      )}

      {[...sections.entries()].map(([section, entries]) => (
        <section key={section}>
          <h2 className="eyebrow mb-2 px-1">{section}</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    className={cn("flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ink-50")}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-canvas text-primary-600">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{entry.label}</span>
                      <span className="block truncate font-mono text-xs text-ink-500">{entry.href}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
