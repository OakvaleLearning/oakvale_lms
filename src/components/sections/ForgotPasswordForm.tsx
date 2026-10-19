"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";

const inputClass =
  "w-full rounded-2xl border border-ink-200 bg-white py-3.5 pl-11 pr-11 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-200";

export function ForgotPasswordForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    const data = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email") }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "sent") {
    return (
      <div>
        <span className="grid size-12 place-items-center rounded-2xl bg-primary-50 text-primary-600">
          <MailCheck className="size-6" />
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          Check your inbox
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          If an account exists for that email address, we&apos;ve sent a link to
          reset your password. The link expires in one hour.
        </p>
        <p className="mt-6 text-sm text-ink-500">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="font-semibold text-primary-600 hover:text-primary-700"
          >
            try another email
          </button>
          .
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="size-4" />
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
        Forgot your password?
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        Enter the email you signed up with and we&apos;ll send you a link to set
        a new password.
      </p>

      {error && (
        <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="relative">
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

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-600/30 transition-all hover:-translate-y-0.5 hover:bg-primary-700 disabled:opacity-70"
        >
          {status === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Remembered it?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary-600 hover:text-primary-700"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
