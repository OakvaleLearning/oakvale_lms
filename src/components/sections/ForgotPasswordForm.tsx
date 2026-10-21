"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthHeading, FormError, TextField } from "@/components/ui/TextField";

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
        <span className="mb-8 grid size-11 place-items-center rounded-xl border border-line bg-white text-primary-600 shadow-card">
          <MailCheck className="size-5" />
        </span>
        <AuthHeading title="Check your inbox">
          If an account exists for that email address, we&apos;ve sent a link to
          reset your password. The link expires in one hour.
        </AuthHeading>
        <p className="mt-6 text-sm text-ink-500">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="font-medium text-primary-600 hover:text-primary-800"
          >
            try another email
          </button>
          .
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex items-center gap-2 border-t border-line pt-6 text-sm font-medium text-ink-700 hover:text-primary-700"
        >
          <ArrowLeft className="size-4" />
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading title="Forgot your password?">
        Enter the email you signed up with and we&apos;ll send you a link to set
        a new password.
      </AuthHeading>

      {error && (
        <div className="mt-8">
          <FormError>{error}</FormError>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <TextField
          label="Email address"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Button type="submit" size="lg" disabled={status === "loading"} className="w-full">
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : "Send reset link"}
        </Button>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-800">
          Log in
        </Link>
      </p>
    </div>
  );
}
