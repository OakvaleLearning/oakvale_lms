"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function EnrollButton({ tierId, label }: { tierId: string; label: string }) {
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
      <Button onClick={start} disabled={loading} className="w-full">
        {loading && <Loader2 className="size-4 animate-spin" />}
        {label}
      </Button>
      {error && <p className="mt-2 text-center text-xs text-accent-600">{error}</p>}
    </div>
  );
}
