import { prisma } from "@/lib/prisma";
import { getUnlockedModuleIds } from "@/lib/lms/access";
import { getEnrolmentGates } from "@/lib/lms/pre-assessment";

/** A programme's module as a plan includes it. */
export interface OfferModule {
  moduleId: string;
  title: string;
  lessons: number;
}

/** One plan (tier) of a programme, ready to show on a card. */
export interface TierOffer {
  id: string;
  slug: string;
  name: string;
  /** Kobo, as stored. */
  price: number;
  tagline: string;
  /** Kobo saved against buying the modules separately; 0 when there is none. */
  saving: number;
  /** Title of a prerequisite module the plan doesn't include, if any. */
  needs: string | null;
  modules: OfferModule[];
  /** Entry test state; undefined when the plan has no pre-assessment. */
  gate: { passed: boolean } | undefined;
  /** The learner can already open every module in this plan. */
  enrolled: boolean;
}

/** A published programme with its plans. */
export interface ProgramOffer {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage: string | null;
  certificateEnabled: boolean;
  cpdEnabled: boolean;
  cpdHours: number | null;
  tiers: TierOffer[];
  /** The plan with the most modules, shown as recommended. Null when no plan has more than one module. */
  recommendedTierId: string | null;
  /** Lowest plan price, for "From ₦…" on the landing page. */
  fromPrice: number | null;
}

/** Strips the programme's name from a module or plan title ("Foundation: Care basics" -> "Care basics"). */
export function shortTitle(programTitle: string, title: string): string {
  return title.startsWith(programTitle) ? title.slice(programTitle.length).replace(/^\s*[:\-–—|]\s*/, "") || title : title;
}

/** Every published programme with its plans, for the signed-in learner (or a visitor when `userId` is null). */
export async function getProgramOffers(userId: string | null): Promise<ProgramOffer[]> {
  const programs = await prisma.program.findMany({
    where: { published: true },
    orderBy: { order: "asc" },
    include: {
      tiers: {
        where: { published: true },
        orderBy: { order: "asc" },
        include: {
          modules: {
            include: {
              module: {
                select: {
                  title: true,
                  published: true,
                  order: true,
                  prerequisiteId: true,
                  prerequisite: { select: { title: true } },
                  topics: { select: { _count: { select: { lessons: { where: { published: true } } } } } },
                },
              },
            },
          },
        },
      },
    },
  });

  // A plan whose modules the learner can already open (e.g. bought "Full") has nothing left to sell them.
  const unlocked = userId ? await getUnlockedModuleIds(userId) : new Set<string>();
  // Plans with an entry test: checkout opens once the learner has passed it.
  const gates = await getEnrolmentGates(
    userId,
    programs.flatMap((p) => p.tiers.map((t) => t.id))
  );

  return programs.map((program) => {
    const short = (title: string) => shortTitle(program.title, title);

    // What each module costs bought on its own (the cheapest single-module plan), so bundles can show their saving.
    const singlePrice = new Map<string, number>();
    for (const t of program.tiers) {
      if (t.modules.length !== 1) continue;
      const id = t.modules[0].moduleId;
      singlePrice.set(id, Math.min(singlePrice.get(id) ?? Infinity, t.price));
    }

    const tiers: TierOffer[] = program.tiers.map((tier) => {
      const modules = tier.modules
        .filter((tc) => tc.module.published)
        .sort((a, b) => a.module.order - b.module.order);
      const ids = new Set(modules.map((tc) => tc.moduleId));
      const separate = modules.reduce((sum, tc) => sum + (singlePrice.get(tc.moduleId) ?? NaN), 0);
      const saving = modules.length > 1 && separate > tier.price ? separate - tier.price : 0;
      const needs = modules.find((tc) => tc.module.prerequisiteId && !ids.has(tc.module.prerequisiteId))?.module.prerequisite;
      const tagline =
        tier.description ||
        (modules.length > 1
          ? "Every module in the programme"
          : needs
            ? `The next step after ${short(needs.title)}`
            : "The place to start your training");
      return {
        id: tier.id,
        slug: tier.slug,
        name: tier.name,
        price: tier.price,
        tagline,
        saving,
        needs: needs ? short(needs.title) : null,
        modules: modules.map((tc) => ({
          moduleId: tc.moduleId,
          title: short(tc.module.title),
          lessons: tc.module.topics.reduce((n, topic) => n + topic._count.lessons, 0),
        })),
        gate: gates.get(tier.id),
        enrolled: tier.modules.length > 0 && tier.modules.every((tc) => unlocked.has(tc.moduleId)),
      };
    });

    const biggest = tiers.reduce<TierOffer | null>(
      (best, t) => (t.modules.length > (best?.modules.length ?? 1) ? t : best),
      null
    );

    return {
      id: program.id,
      slug: program.slug,
      title: program.title,
      description: program.description,
      coverImage: program.coverImage,
      certificateEnabled: program.certificateEnabled,
      cpdEnabled: program.cpdEnabled,
      cpdHours: program.cpdHours,
      tiers,
      recommendedTierId: biggest?.id ?? null,
      fromPrice: tiers.length ? Math.min(...tiers.map((t) => t.price)) : null,
    };
  });
}
