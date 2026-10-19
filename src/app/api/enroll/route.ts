import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { generateReference, initializeTransaction } from "@/lib/paystack";

const enrollSchema = z.object({ tierId: z.string().min(1).max(40) });

/** Start checkout for a tier: reuse/create the PENDING enrolment, open a Paystack transaction. */
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Please log in to enrol." }, { status: 401 });
    }
    const parsed = enrollSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const tier = await prisma.tier.findFirst({
      where: { id: parsed.data.tierId, published: true, program: { published: true } },
      include: { program: { select: { slug: true } } },
    });
    if (!tier) {
      return NextResponse.json({ error: "This option is not available." }, { status: 404 });
    }

    const identity = { userId_tierId: { userId: session.userId, tierId: tier.id } };
    const existing = await prisma.enrollment.findUnique({ where: identity });
    if (existing?.status === "ACTIVE") {
      return NextResponse.json({ error: "You are already enrolled.", enrolled: true }, { status: 409 });
    }

    const reference = generateReference();
    // Keyed on the unique (user, tier) pair, so retries and double clicks
    // reuse one enrolment; each attempt gets its own Payment row.
    const enrollment = await prisma.enrollment.upsert({
      where: identity,
      update: {
        status: "PENDING",
        amount: tier.price,
        payments: { create: { userId: session.userId, reference, amount: tier.price } },
      },
      create: {
        userId: session.userId,
        tierId: tier.id,
        amount: tier.price,
        payments: { create: { userId: session.userId, reference, amount: tier.price } },
      },
    });

    const origin = new URL(req.url).origin;
    const { authorizationUrl, simulated } = await initializeTransaction({
      email: session.email,
      amountKobo: tier.price,
      reference,
      callbackUrl: `${origin}/payment/callback`,
      metadata: { enrollmentId: enrollment.id, userId: session.userId, program: tier.program.slug, tier: tier.slug },
    });

    return NextResponse.json({ ok: true, authorizationUrl, simulated });
  } catch (err) {
    console.error("enroll error:", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
