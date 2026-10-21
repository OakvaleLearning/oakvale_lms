"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/TextField";

export function EnrollButton({
  tierId,
  label,
  variant = "primary",
  size = "lg",
}: {
  tierId: string;
  label: string;
  variant?: "primary" | "white" | "dark";
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId }),
      });
      const json = await res.json();
      if (json.enrolled) {
        router.push("/learn");
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Could not start checkout");
      window.location.href = json.authorizationUrl;
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Could not start checkout");
    }
  }

  return (
    <div>
      <Button onClick={start} disabled={loading} variant={variant} size={size} className="w-full">
        {loading && <Loader2 className="size-4 animate-spin" />}
        {label}
      </Button>
      {error && (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
    </div>
  );
}
