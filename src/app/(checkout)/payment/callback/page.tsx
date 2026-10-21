import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { isPrelaunch } from "@/lib/launch";
import { PaymentResult } from "./PaymentResult";

export const metadata = { title: "Payment" };

export default function PaymentCallbackPage() {
  return (
    <div className="px-5 py-16 sm:py-24">
      <Suspense
        fallback={
          <div className="flex justify-center">
            <Loader2 className="size-10 animate-spin text-primary-600" />
          </div>
        }
      >
        <PaymentResult prelaunch={isPrelaunch()} />
      </Suspense>
    </div>
  );
}
