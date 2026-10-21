import { Lock } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";
import { getSession, isEmailVerified } from "@/lib/auth";
import { PageTransition } from "@/components/motion";
import { CheckoutSteps } from "./CheckoutSteps";

export default async function CheckoutLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  const verified = session ? await isEmailVerified(session.userId) : false;
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Logo className="[&_img]:h-8!" />
          <CheckoutSteps verified={verified} />
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-canvas px-3 text-xs font-medium text-ink-600">
            <Lock className="size-3.5 text-emerald-600" />
            Secure checkout
          </span>
        </div>
      </header>
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <footer className="border-t border-line bg-white py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs text-ink-500 sm:flex-row sm:px-8">
          <p>Payments processed securely by Paystack</p>
          <p className="flex gap-4">
            <a href={SITE.marketingUrl} className="hover:text-ink-900">
              Back to main site
            </a>
            <a href={`mailto:${SITE.email}`} className="underline decoration-ink-300 underline-offset-2 hover:text-ink-900">
              Need help?
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
