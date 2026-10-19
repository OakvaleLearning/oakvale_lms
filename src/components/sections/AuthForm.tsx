"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Lock,
  Phone,
  User,
  AlertCircle,
} from "lucide-react";

const inputWrap = "relative";
const inputClass =
  "w-full rounded-2xl border border-ink-200 bg-white py-3.5 pl-11 pr-11 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-200";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  // Only same-site paths — never an absolute URL (open-redirect).
  const rawNext = params.get("next");
  const next = rawNext && /^\/(?![/\\])/.test(rawNext) ? rawNext : null;

  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    const data = new FormData(e.currentTarget);
    const payload = isSignup
      ? {
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          password: data.get("password"),
        }
      : { email: data.get("email"), password: data.get("password") };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");

      const destination =
        next || (json.role === "ADMIN" ? "/admin" : "/learn");
      router.push(destination);
      router.refresh();
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        {isSignup
          ? "Start your journey to a verified caregiving career."
          : "Log in to continue your learning journey."}
      </p>

      {error && (
        <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {isSignup && (
          <div className={inputWrap}>
            <User className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              name="name"
              required
              placeholder="Full name"
              autoComplete="name"
              className={inputClass}
            />
          </div>
        )}
        <div className={inputWrap}>
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            name="email"
            type="email"
            required
            placeholder="Email address"
            autoComplete="email"
            className={inputClass}
          />
        </div>
        {isSignup && (
          <div className={inputWrap}>
            <Phone className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              name="phone"
              type="tel"
              required
              placeholder="WhatsApp number"
              autoComplete="tel"
              inputMode="tel"
              className={inputClass}
            />
          </div>
        )}
        <div className={inputWrap}>
          <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            placeholder="Password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 8 : undefined}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 hover:text-ink-700"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {isSignup ? (
          <p className="text-xs text-ink-400">
            Use at least 8 characters. We&apos;ll use your WhatsApp number for
            course updates and support — nothing else.
          </p>
        ) : (
          <p className="text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              Forgot password?
            </Link>
          </p>
        )}

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:-translate-y-0.5 hover:bg-primary-700 disabled:opacity-70"
        >
          {status === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isSignup ? (
            "Create account"
          ) : (
            "Log in"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        {isSignup ? "Already have an account? " : "Don't have an account? "}
        <Link
          href={
            isSignup
              ? `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`
              : `/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`
          }
          className="font-semibold text-primary-600 hover:text-primary-700"
        >
          {isSignup ? "Log in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
