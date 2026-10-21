import { Lock } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";
import { PageTransition } from "@/components/motion";

export default function CheckoutLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Logo className="[&_img]:h-8!" />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <Lock className="size-3.5 text-ink-400" />
            Secure checkout
          </span>
        </div>
      </header>
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <footer className="border-t border-line py-6">
        <p className="text-center text-xs text-ink-500">
          Payments processed securely by Paystack ·{" "}
          <a href={`mailto:${SITE.email}`} className="underline decoration-ink-300 underline-offset-2 hover:text-ink-900">
            Need help?
          </a>
        </p>
      </footer>
    </div>
  );
}
