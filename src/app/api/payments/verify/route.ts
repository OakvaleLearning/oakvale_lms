import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { reconcilePayment } from "@/lib/payments";

/** Called by the payment callback page after Paystack redirects back. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const reference = new URL(req.url).searchParams.get("reference");
  if (!reference) return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment || payment.userId !== session.userId) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const result = await reconcilePayment(reference);
  return NextResponse.json({ status: result?.status === "SUCCESS" ? "success" : "failed" });
}
