"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthHeading, FormError, PasswordField, TextField } from "@/components/ui/TextField";
import { HONEYPOT_FIELD } from "@/lib/auth-form";
import { safeNextPath } from "@/lib/utils";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));

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
          next,
          [HONEYPOT_FIELD]: data.get(HONEYPOT_FIELD),
        }
      : { email: data.get("email"), password: data.get("password"), [HONEYPOT_FIELD]: data.get(HONEYPOT_FIELD) };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");

      const destination = json.verify
        ? `/verify-email${next ? `?next=${encodeURIComponent(next)}` : ""}`
        : next || (json.role === "ADMIN" ? "/admin" : "/learn");
      router.push(destination);
      router.refresh();
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div>
      <AuthHeading title={isSignup ? "Create your account" : "Welcome back"}>
        {isSignup
          ? "Start your journey to a verified caregiving career."
          : "Log in to continue your learning journey."}
      </AuthHeading>

      {error && (
        <div className="mt-8">
          <FormError>{error}</FormError>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <Honeypot />
        {isSignup && (
          <TextField label="Full name" name="name" required autoComplete="name" placeholder="Ada Okafor" />
        )}
        <TextField
          label="Email address"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        {isSignup && (
          <TextField
            label="WhatsApp number"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="0810 818 9514"
            hint="For course updates and support, nothing else."
          />
        )}
        <PasswordField
          label="Password"
          name="password"
          required
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={isSignup ? 8 : undefined}
          hint={isSignup ? "At least 8 characters." : undefined}
          labelAction={
            !isSignup && (
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary-600 hover:text-primary-800"
              >
                Forgot password?
              </Link>
            )
          }
        />

        <Button type="submit" size="lg" disabled={status === "loading"} className="mt-2 w-full">
          {status === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {isSignup ? "Create account" : "Log in"}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm text-ink-500">
        {isSignup ? "Already have an account? " : "New to Oakvale? "}
        <Link
          href={
            isSignup
              ? `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`
              : `/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`
          }
          className="font-medium text-primary-600 hover:text-primary-800"
        >
          {isSignup ? "Log in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}

/** Hidden from people (off-screen, skipped by keyboard and screen readers); bots that fill every field reveal themselves. */
export function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}
