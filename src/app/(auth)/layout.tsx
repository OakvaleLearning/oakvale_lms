import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";
import { PageTransition, Reveal, Stagger, StaggerItem } from "@/components/motion";

const FEATURES = [
  { title: "Certified, job-ready training", text: "Practical modules built around real care settings." },
  { title: "Globally aligned curriculum", text: "Standards recognised by employers at home and abroad." },
  { title: "Real career pathways", text: "Guidance and placement support once you qualify." },
];

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session) redirect(session.role === "ADMIN" ? "/admin" : "/learn");

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-primary-950 lg:block">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-35 mix-blend-luminosity"
          style={{ backgroundImage: "url('/why-oakvale-bg1.png')" }}
        />
        <div className="absolute inset-0 bg-primary-950/55" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white xl:p-16">
          <Logo dark />

          <div className="max-w-lg">
            <Reveal>
              <p className="eyebrow text-primary-200!">Oakvale Learning</p>
            </Reveal>
            <Reveal delay={0.08} y={24}>
              <h2 className="mt-5 font-display text-4xl leading-[1.08] xl:text-5xl">
                Step into a verified <em className="text-primary-200">healthcare</em> career.
              </h2>
            </Reveal>
            <Reveal delay={0.18}>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/70">
                Join the next generation of certified caregivers shaping the future of adult and
                early childhood care.
              </p>
            </Reveal>

            <Stagger as="ol" className="mt-12 divide-y divide-white/10 border-y border-white/10">
              {FEATURES.map((f, i) => (
                <StaggerItem as="li" key={f.title} className="flex gap-5 py-4">
                  <span className="pt-0.5 font-mono text-xs text-primary-300">0{i + 1}</span>
                  <div>
                    <div className="text-sm font-medium text-white">{f.title}</div>
                    <div className="mt-0.5 text-sm text-white/55">{f.text}</div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          <p className="text-xs text-white/45">© {new Date().getFullYear()} Oakvale Learning</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col bg-canvas">
        <div className="flex items-center justify-between px-6 py-5 sm:px-10">
          <div className="lg:hidden">
            <Logo />
          </div>
          <Link
            href={SITE.marketingUrl}
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-ink-900"
          >
            <ArrowLeft className="size-4" />
            Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16 pt-6 sm:px-10">
          <PageTransition className="w-full max-w-[400px]">{children}</PageTransition>
        </div>
      </div>
    </div>
  );
}
