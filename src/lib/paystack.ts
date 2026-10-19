import "server-only";

const PAYSTACK_BASE = "https://api.paystack.co";

/**
 * Paystack is "configured" only when a real-looking secret key is present.
 * Until the user drops real test keys into env, we fall back to a local
 * simulation so the full enrollment flow remains testable end-to-end.
 */
export function isPaystackConfigured(): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY ?? "";
  return key.startsWith("sk_") && !key.includes("replace_me");
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set");
  return key;
}

export function generateReference(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `oaklms_${Date.now().toString(36)}_${rand}`;
}

interface InitParams {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

interface InitResult {
  authorizationUrl: string;
  reference: string;
  simulated: boolean;
}

export async function initializeTransaction(
  params: InitParams
): Promise<InitResult> {
  if (!isPaystackConfigured()) {
    // Local simulation: skip Paystack, go straight to our callback.
    const url = new URL(params.callbackUrl);
    url.searchParams.set("reference", params.reference);
    url.searchParams.set("simulated", "1");
    return {
      authorizationUrl: url.toString(),
      reference: params.reference,
      simulated: true,
    };
  }

  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      currency: "NGN",
      metadata: params.metadata,
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.status) {
    throw new Error(json.message ?? "Failed to initialize payment");
  }
  return {
    authorizationUrl: json.data.authorization_url,
    reference: json.data.reference,
    simulated: false,
  };
}

interface VerifyResult {
  success: boolean;
  channel?: string;
  paidAt?: Date;
  amountKobo?: number;
}

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  // Never let the client opt into simulation: only simulate when no real key
  // is configured (local development).
  if (!isPaystackConfigured()) {
    // Simulated payment always succeeds (dev/testing only).
    return { success: true, channel: "simulated", paidAt: new Date() };
  }

  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secretKey()}` },
      cache: "no-store",
    }
  );

  const json = await res.json();
  if (!res.ok || !json.status) {
    return { success: false };
  }
  const data = json.data;
  return {
    success: data.status === "success",
    channel: data.channel,
    paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
    amountKobo: data.amount,
  };
}
