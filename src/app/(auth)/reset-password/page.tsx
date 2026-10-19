import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/sections/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
