"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { X, LogOut, ArrowUpRight, UserRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";
import { EASE, PageTransition } from "@/components/motion";
import { AndroidAppPrompt } from "@/components/dashboard/AndroidAppPrompt";
import { SUPPORT_READ_EVENT } from "@/components/support/SupportChat";
import { COMMUNITY_READ_EVENT } from "@/components/community/NotificationsRead";
import { Avatar } from "@/components/community/Avatar";
import { GuideNavButton, GuidePanel } from "@/components/guide/GuidePanel";
import { GuideTour } from "@/components/guide/GuideTour";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { NAV } from "@/components/dashboard/nav";


export function DashboardShell({
  variant,
  user,
  title,
  children,
}: {
  variant: "learner" | "admin";
  user: { name: string; email: string; role: string; avatar?: string | null };
  title: string;
  children: React.ReactNode;
}) {
  const nav = NAV[variant];
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useUnread(pathname, "/api/support/unread", SUPPORT_READ_EVENT);
  const communityUnread = useUnread(pathname, variant === "learner" ? "/api/community/notifications/unread" : null, COMMUNITY_READ_EVENT);
  const badges = { support: unread, community: communityUnread };
  // Quick suggestions in the header search: the sidebar links, plus Profile for admins (learners already have it).
  const searchLinks = [
    ...nav.items,
    ...(variant === "admin" ? [{ label: "Profile", href: "/account", icon: UserRound, keywords: "account name photo" }] : []),
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Rendered twice (desktop rail + mobile drawer); `scope` keeps their sliding indicators separate.
  const sidebar = (scope: string) => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo className="[&_img]:h-8!" />
      </div>

      <nav className="flex-1 px-3 pt-4">
        <div className="eyebrow px-3 pb-2 text-ink-400!">{nav.section}</div>
        <ul className="space-y-0.5">
          {nav.items.map((item) => {
            // The longest matching link wins, so /learn/certificates doesn't also light up "My learning".
            const matches = (href: string) =>
              href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            const active =
              matches(item.href) && !nav.items.some((o) => o.href.length > item.href.length && matches(o.href));
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  data-guide-nav={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                    active ? "font-medium text-ink-950" : "text-ink-600 hover:bg-ink-900/[0.04] hover:text-ink-900"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={`nav-active-${scope}`}
                      className="absolute inset-0 rounded-lg border border-line bg-white shadow-card"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <Icon className={cn("relative size-4", active ? "text-primary-600" : "text-ink-400")} />
                  <span className="relative flex-1">{item.label}</span>
                  {item.badge && badges[item.badge] > 0 && (
                    <span
                      className="relative grid h-5 min-w-5 place-items-center rounded-full bg-primary-600 px-1.5 text-[11px] font-semibold tabular-nums text-white"
                      aria-label={`${badges[item.badge]} unread`}
                    >
                      {badges[item.badge] > 99 ? "99+" : badges[item.badge]}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-3 p-3">
        <GuideNavButton onOpen={() => setOpen(false)} />
        <a
          href={SITE.marketingUrl}
          className="flex h-9 items-center justify-between rounded-lg px-3 text-sm text-ink-600 transition-colors hover:bg-ink-900/[0.04] hover:text-ink-900"
        >
          Visit Oakvale site
          <ArrowUpRight className="size-4 text-ink-400" />
        </a>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-2.5 shadow-card">
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg"
            title="Edit your profile"
          >
            <Avatar name={user.name} src={user.avatar ?? null} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-900">{user.name}</div>
              <div className="truncate text-xs text-ink-500">{user.email}</div>
            </div>
          </Link>
          <button
            onClick={logout}
            className="grid size-8 shrink-0 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {variant === "learner" && <AndroidAppPrompt />}
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-sidebar lg:block">
        {sidebar("rail")}
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-ink-950/30"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 border-r border-line bg-sidebar shadow-raised"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {sidebar("drawer")}
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-4 grid size-8 place-items-center rounded-md text-ink-500 hover:bg-ink-100"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <DashboardHeader
          title={title}
          user={user}
          searchLinks={searchLinks}
          supportHref={variant === "admin" ? "/admin/support" : "/support"}
          supportUnread={unread}
          onOpenMenu={() => setOpen(true)}
          onLogout={logout}
        />

        <main className="px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <GuidePanel audience={variant} />
      <GuideTour />
    </div>
  );
}

/** A badge count, refreshed on navigation, every 30 seconds and when `readEvent` fires. */
function useUnread(pathname: string, endpoint: string | null, readEvent: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!endpoint) return;
    let cancelled = false;
    const load = () =>
      fetch(endpoint, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { count: number } | null) => !cancelled && data && setCount(data.count))
        .catch(() => {});
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    window.addEventListener(readEvent, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(readEvent, load);
    };
  }, [pathname, endpoint, readEvent]);
  return count;
}
