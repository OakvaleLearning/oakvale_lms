"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from "lucide-react";

const inputClass =
  "w-full rounded-2xl border border-ink-200 bg-white py-3.5 pl-11 pr-11 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-200";

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");

    if (password !== String(data.get("confirmPassword") ?? "")) {
      setError("Both passwords must match.");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");

      router.push(json.role === "ADMIN" ? "/admin" : "/learn");
      router.refresh();
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!token) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          This link isn&apos;t valid
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          The reset link is incomplete or has already been used. Request a fresh
          one and we&apos;ll email it straight over.
        </p>
        <Link
          href="/forgot-password"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:-translate-y-0.5 hover:bg-primary-700"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
        Set a new password
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        Choose a new password for your account. You&apos;ll be logged in right
        after.
      </p>

      {error && (
        <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            placeholder="New password"
            autoComplete="new-password"
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
        <div className="relative">
          <Lock className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            placeholder="Confirm new password"
            autoComplete="new-password"
            className={inputClass}
          />
        </div>
        <p className="text-xs text-ink-400">Use at least 8 characters.</p>

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:-translate-y-0.5 hover:bg-primary-700 disabled:opacity-70"
        >
          {status === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Update password"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        <Link
          href="/login"
          className="font-semibold text-primary-600 hover:text-primary-700"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}
