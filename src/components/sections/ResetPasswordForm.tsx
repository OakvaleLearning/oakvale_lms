"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Honeypot } from "@/components/sections/AuthForm";
import { HONEYPOT_FIELD } from "@/lib/auth-form";
import { AuthHeading, FormError, PasswordField } from "@/components/ui/TextField";

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

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
        body: JSON.stringify({ token, password, [HONEYPOT_FIELD]: data.get(HONEYPOT_FIELD) }),
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
        <AuthHeading title="This link isn’t valid">
          The reset link is incomplete or has already been used. Request a fresh
          one and we&apos;ll email it straight over.
        </AuthHeading>
        <ButtonLink href="/forgot-password" size="lg" className="mt-8 w-full">
          Request a new link
        </ButtonLink>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading title="Set a new password">
        Choose a new password for your account. You&apos;ll be logged in right
        after.
      </AuthHeading>

      {error && (
        <div className="mt-8">
          <FormError>{error}</FormError>
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <Honeypot />
        <PasswordField
          label="New password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="At least 8 characters."
        />
        <PasswordField
          label="Confirm new password"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Button type="submit" size="lg" disabled={status === "loading"} className="mt-2 w-full">
          {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
        </Button>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-sm">
        <Link href="/login" className="font-medium text-primary-600 hover:text-primary-800">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
