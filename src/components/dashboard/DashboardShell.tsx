"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV: Record<"learner" | "admin", NavItem[]> = {
  learner: [
    { label: "My learning", href: "/learn", icon: BookOpen },
    { label: "Programmes", href: "/enroll", icon: ShoppingBag },
  ],
  admin: [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Programmes", href: "/admin/programs", icon: Layers },
    { label: "Learners", href: "/admin/learners", icon: Users },
    { label: "Payments", href: "/admin/payments", icon: Receipt },
  ],
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
  const navItems = NAV[variant];
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

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

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-6 py-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active =
            item.href === "/learn" || item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-600 text-white shadow-sm shadow-primary-600/30"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              )}
            >
              <Icon className="size-4.5 [width:1.125rem] [height:1.125rem]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-ink-100 p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink-900">
              {user.name}
            </div>
            <div className="truncate text-xs text-ink-400">{user.email}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-accent-50 hover:text-accent-600"
        >
          <LogOut className="size-4.5 [width:1.125rem] [height:1.125rem]" />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink-100 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-ink-100 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="grid size-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-100 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="text-lg font-bold text-ink-900">{title}</h1>
          <div className="ml-auto">
            <a
              href={SITE.marketingUrl}
              className="text-sm font-medium text-ink-500 hover:text-primary-600"
            >
              View site
            </a>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>

      {/* Close btn for mobile drawer accessibility */}
      {open && (
        <button
          onClick={() => setOpen(false)}
          className="fixed right-4 top-4 z-[60] grid size-9 place-items-center rounded-lg bg-white text-ink-700 shadow lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  );
}
