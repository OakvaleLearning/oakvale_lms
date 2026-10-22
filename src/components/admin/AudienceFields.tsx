"use client";

import { useState } from "react";
import { Field, Select } from "@/components/admin/forms";

type Audience = "ALL_PAID" | "PROGRAM" | "TIER";

/** Who is in a community group: everyone who has paid, one programme, or one tier. */
export function AudienceFields({
  programs,
  defaults,
}: {
  programs: { id: string; title: string; tiers: { id: string; name: string }[] }[];
  defaults?: { audience: Audience; programId: string | null; tierId: string | null };
}) {
  const [audience, setAudience] = useState<Audience>(defaults?.audience ?? "PROGRAM");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Members" hint="Learners are added and removed automatically as their enrolments change.">
        <Select name="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
          <option value="ALL_PAID">Everyone who has enrolled</option>
          <option value="PROGRAM">Learners in one programme</option>
          <option value="TIER">Learners on one tier</option>
        </Select>
      </Field>
      {audience === "PROGRAM" && (
        <Field label="Programme">
          <Select name="programId" defaultValue={defaults?.programId ?? programs[0]?.id} required>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {audience === "TIER" && (
        <Field label="Tier">
          <Select name="tierId" defaultValue={defaults?.tierId ?? programs[0]?.tiers[0]?.id} required>
            {programs.map((p) => (
              <optgroup key={p.id} label={p.title}>
                {p.tiers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}
