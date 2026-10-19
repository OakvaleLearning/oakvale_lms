import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/sections/AuthForm";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
