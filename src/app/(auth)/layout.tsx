import Link from "next/link";
import { ArrowLeft, ShieldCheck, Globe2, Award } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session) redirect(session.role === "ADMIN" ? "/admin" : "/learn");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-mesh lg:block bg-no-repeat bg-cover" style={{backgroundImage: "url('/why-oakvale-bg1.png')" }}>
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="pointer-events-none absolute -right-20 top-24 size-96 rounded-full bg-accent-500/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo dark />
          <div>
            <h2 className="max-w-md text-3xl font-bold leading-tight xl:text-4xl">
              Step into a verified healthcare career.
            </h2>
            <p className="mt-4 max-w-sm text-ink-200">
              Join the next generation of certified caregivers shaping the
              future of adult and early childhood care.
            </p>
            <ul className="mt-8 space-y-3">
              {[
                { Icon: ShieldCheck, text: "Certified, job-ready training" },
                { Icon: Globe2, text: "Globally aligned curriculum" },
                { Icon: Award, text: "Real career pathways & placement" },
              ].map((f) => (
                <li key={f.text} className="flex items-center gap-3 text-ink-100">
                  <span className="grid size-9 place-items-center rounded-xl bg-white/10">
                    <f.Icon className="size-4.5 text-accent-300 [width:1.125rem] [height:1.125rem]" />
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-ink-300">
            © {new Date().getFullYear()} Oakvale Learning
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col">
        <div className="p-6">
          <Link
            href={SITE.marketingUrl}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-500 transition-colors hover:text-primary-600"
          >
            <ArrowLeft className="size-4" />
            Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  );
}
