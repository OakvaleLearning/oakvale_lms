import { ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";
import { PageTransition } from "@/components/motion";

export default function VerifyLayout({ children }: LayoutProps<"/verify">) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-8">
          <Logo className="[&_img]:h-8!" />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <ShieldCheck className="size-3.5 text-ink-400" />
            Certificate verification
          </span>
        </div>
      </header>
      <main className="flex-1 px-4 py-10 sm:px-8 sm:py-14">
        <PageTransition>{children}</PageTransition>
      </main>
      <footer className="border-t border-line py-6">
        <p className="px-4 text-center text-xs text-ink-500">
          Certificates are issued by {SITE.name}. Questions about a certificate?{" "}
          <a href={`mailto:${SITE.email}`} className="underline decoration-ink-300 underline-offset-2 hover:text-ink-900">
            {SITE.email}
          </a>
        </p>
      </footer>
    </div>
  );
}
