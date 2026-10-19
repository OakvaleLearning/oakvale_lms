import { Lock } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { SITE } from "@/content/site";

export default function CheckoutLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500">
            <Lock className="size-3.5 text-primary-600" />
            Secure checkout
          </span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-ink-100 py-6">
        <p className="text-center text-xs text-ink-400">
          Payments processed securely by Paystack ·{" "}
          <a href={`mailto:${SITE.email}`} className="hover:text-primary-600">
            Need help?
          </a>
        </p>
      </footer>
    </div>
  );
}
