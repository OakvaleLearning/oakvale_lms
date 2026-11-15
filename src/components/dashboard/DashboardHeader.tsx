"use client";

import { useEffect, useRef, useState, type ElementType, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LogOut, Menu, MessagesSquare, Search, UserRound } from "lucide-react";
import { SITE } from "@/content/site";
import { Avatar } from "@/components/community/Avatar";
import { GuideTopbarButton } from "@/components/guide/GuidePanel";
import { matchEntries } from "@/components/dashboard/search";

export interface HeaderLink {
  label: string;
  href: string;
  icon: ElementType;
  keywords?: string;
}

/**
 * Top bar above every dashboard page: menu (phones), page search, help, support and the account menu.
 * Sits in the content column, so it stays clear of the sidebar on desktop.
 */
export function DashboardHeader({
  title,
  user,
  searchLinks,
  supportHref,
  supportUnread,
  onOpenMenu,
  onLogout,
}: {
  title: string;
  user: { name: string; email: string; avatar?: string | null };
  /** Pages the search box can jump to. */
  searchLinks: HeaderLink[];
  supportHref: string;
  supportUnread: number;
  onOpenMenu: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-primary-900 bg-primary-800 px-4 text-primary-50 sm:gap-3 sm:px-8 lg:h-16 lg:px-12">
      <button
        onClick={onOpenMenu}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-primary-50 hover:bg-white/10 lg:hidden"
        aria-label="Open menu"
        data-guide="menu"
      >
        <Menu className="size-5" />
      </button>
      <span className="hidden max-w-40 shrink-0 truncate text-sm font-medium text-primary-50 sm:block lg:hidden">{title}</span>

      <SearchBox links={searchLinks} />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <GuideTopbarButton className="grid size-9 place-items-center rounded-lg text-primary-50 hover:bg-white/10" />
        <Link
          href={supportHref}
          className="relative grid size-9 place-items-center rounded-lg text-primary-50 hover:bg-white/10"
          aria-label={supportUnread > 0 ? `Support: ${supportUnread} unread` : "Support"}
          title="Support"
        >
          <MessagesSquare className="size-5" />
          {supportUnread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-gold-light ring-2 ring-primary-600" />}
        </Link>
        <span className="mx-1 hidden h-6 w-px bg-white/25 sm:block" aria-hidden />
        <AccountMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}

/** Jumps to a page by its label. "/" focuses it, Enter opens the first match, Escape clears it. */
function SearchBox({ links }: { links: HeaderLink[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim();
  // Quick suggestions only; Enter opens the full results page.
  const results = matchEntries(links.map((l) => ({ ...l, section: "Pages" })), q).slice(0, 6);

  useEffect(() => {
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function go(href: string) {
    setQuery("");
    setOpen(false);
    input.current?.blur();
    router.push(href);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
      input.current?.blur();
    }
  }

  return (
    <div ref={wrap} className="relative min-w-0 flex-1 max-w-md">
      <form role="search" onSubmit={submit} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search pages"
          aria-label="Search pages"
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-line bg-white pl-9 pr-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[11px] text-ink-400 md:block">
          /
        </kbd>
      </form>
      {open && q !== "" && (
        <ul
          id="dashboard-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-raised"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-500">No pages match &ldquo;{query.trim()}&rdquo;</li>
          ) : (
            results.map((l) => {
              const Icon = l.icon;
              return (
                <li key={l.href} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => go(l.href)}
                    className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-ink-700 hover:bg-ink-50 hover:text-ink-950"
                  >
                    <Icon className="size-4 text-ink-400" />
                    {l.label}
                  </button>
                </li>
              );
            })
          )}
          {results.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => go(`/search?q=${encodeURIComponent(q)}`)}
                className="flex h-9 w-full items-center gap-3 rounded-lg border-t border-line px-3 text-left text-sm font-medium text-primary-700 hover:bg-primary-50"
              >
                <Search className="size-4" />
                See all results for &ldquo;{q}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Avatar button with the signed-in person's name and email, profile, the public site and log out. */
function AccountMenu({
  user,
  onLogout,
}: {
  user: { name: string; email: string; avatar?: string | null };
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950";

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        title={user.name}
        className="grid place-items-center rounded-full bg-white p-0.5 transition-colors hover:bg-white/80"
      >
        <Avatar name={user.name} src={user.avatar ?? null} size="sm" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-raised"
        >
          <div className="px-3 py-2.5">
            <div className="truncate text-sm font-medium text-ink-900">{user.name}</div>
            <div className="truncate text-xs text-ink-500">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-line" />
          <Link href="/account" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <UserRound className="size-4 text-ink-400" />
            Profile
          </Link>
          <a href={SITE.marketingUrl} role="menuitem" className={itemClass}>
            <ArrowUpRight className="size-4 text-ink-400" />
            Visit Oakvale site
          </a>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={itemClass}
          >
            <LogOut className="size-4 text-ink-400" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
