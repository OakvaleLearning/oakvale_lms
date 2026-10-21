"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  BookOpen,
  Layers,
  Receipt,
  Users,
  ShoppingBag,
  ArrowUpRight,
  LifeBuoy,
  MessagesSquare,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";
import { EASE, PageTransition } from "@/components/motion";
import { SUPPORT_READ_EVENT } from "@/components/support/SupportChat";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  /** Shows the support unread count. */
  badge?: boolean;
}

const NAV: Record<"learner" | "admin", { section: string; items: NavItem[] }> = {
  learner: {
    section: "Learning",
    items: [
      { label: "My learning", href: "/learn", icon: BookOpen },
      { label: "Programmes", href: "/enroll", icon: ShoppingBag },
      { label: "Support", href: "/support", icon: LifeBuoy, badge: true },
    ],
  },
  admin: {
    section: "Manage",
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard },
      { label: "Programmes", href: "/admin/programs", icon: Layers },
      { label: "Learners", href: "/admin/learners", icon: Users },
      { label: "Payments", href: "/admin/payments", icon: Receipt },
      { label: "Support", href: "/admin/support", icon: MessagesSquare, badge: true },
    ],
  },
};

export function DashboardShell({
  variant,
  user,
  title,
  children,
}: {
  variant: "learner" | "admin";
  user: { name: string; email: string; role: string };
  title: string;
  children: React.ReactNode;
}) {
  const nav = NAV[variant];
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = useSupportUnread(pathname);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
            const active =
              item.href === "/learn" || item.href === "/admin"
                ? pathname === item.href || (item.href === "/learn" && pathname.startsWith("/learn/"))
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
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
                  {item.badge && unread > 0 && (
                    <span
                      className="relative grid h-5 min-w-5 place-items-center rounded-full bg-primary-600 px-1.5 text-[11px] font-semibold tabular-nums text-white"
                      aria-label={`${unread} unread`}
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-3 p-3">
        <a
          href={SITE.marketingUrl}
          className="flex h-9 items-center justify-between rounded-lg px-3 text-sm text-ink-600 transition-colors hover:bg-ink-900/[0.04] hover:text-ink-900"
        >
          Visit Oakvale site
          <ArrowUpRight className="size-4 text-ink-400" />
        </a>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-2.5 shadow-card">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-600 text-[11px] font-semibold tracking-wide text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-900">{user.name}</div>
            <div className="truncate text-xs text-ink-500">{user.email}</div>
          </div>
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
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-canvas lg:block">
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
              className="absolute inset-y-0 left-0 w-72 border-r border-line bg-canvas shadow-raised"
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
        {/* Mobile topbar */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-md lg:hidden">
          <button
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-100"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <span className="flex-1 text-sm font-medium text-ink-900">{title}</span>
          {unread > 0 && (
            <Link
              href={variant === "admin" ? "/admin/support" : "/support"}
              className="relative grid size-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-100"
              aria-label={`Support: ${unread} unread`}
            >
              <MessagesSquare className="size-5" />
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary-600" />
            </Link>
          )}
        </header>

        <main className="px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}

/** Support badge count, refreshed on navigation and every 30 seconds. */
function useSupportUnread(pathname: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/support/unread", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { count: number } | null) => !cancelled && data && setCount(data.count))
        .catch(() => {});
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    window.addEventListener(SUPPORT_READ_EVENT, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(SUPPORT_READ_EVENT, load);
    };
  }, [pathname]);
  return count;
}
