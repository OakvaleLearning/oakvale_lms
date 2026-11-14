import { BookOpen, Layers, ShoppingBag, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import { getLearnerHome } from "@/lib/lms/catalog";
import { NAV } from "@/components/dashboard/nav";
import type { SearchEntry } from "@/components/dashboard/search";

/**
 * Every internal page this person can open, for the dashboard search: the sidebar pages, then their
 * own programmes and modules. Admins get the catalogue (programmes and modules) instead of learner pages.
 */
export async function buildSearchIndex(session: SessionPayload, variant: "learner" | "admin"): Promise<SearchEntry[]> {
  const nav = NAV[variant];
  const entries: SearchEntry[] = nav.items.map((item) => ({
    label: item.label,
    href: item.href,
    section: nav.section,
    icon: item.icon,
    keywords: item.keywords,
  }));

  if (variant === "admin") {
    entries.push({ label: "Profile", href: "/account", section: nav.section, icon: UserRound, keywords: "account name photo" });
    const [programs, modules] = await Promise.all([
      prisma.program.findMany({ select: { id: true, title: true, slug: true, description: true } }),
      prisma.module.findMany({ select: { id: true, title: true, program: { select: { title: true } } } }),
    ]);
    for (const p of programs) {
      entries.push({ label: p.title, href: `/admin/programs/${p.id}`, section: "Programmes", icon: Layers, keywords: `${p.slug} ${p.description}` });
    }
    for (const m of modules) {
      entries.push({ label: m.title, href: `/admin/modules/${m.id}`, section: m.program.title, icon: Layers, keywords: "module" });
    }
    return entries;
  }

  // Learners: the modules they can open now, then the programmes on sale.
  const [home, published] = await Promise.all([
    getLearnerHome(session.userId),
    prisma.program.findMany({ where: { published: true }, select: { slug: true, title: true, description: true } }),
  ]);
  for (const program of home.programs) {
    for (const mod of program.modules) {
      if (mod.lock !== "OPEN") continue;
      entries.push({
        label: mod.title,
        href: `/learn/${program.slug}/${mod.slug}`,
        section: program.title,
        icon: BookOpen,
        keywords: "module lessons",
      });
    }
  }
  for (const p of published) {
    entries.push({
      label: p.title,
      href: `/programmes?program=${encodeURIComponent(p.slug)}`,
      section: "Programmes",
      icon: ShoppingBag,
      keywords: `enrol plans ${p.description}`,
    });
  }
  return entries;
}
