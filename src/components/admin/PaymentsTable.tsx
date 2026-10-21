import { formatDate, formatNaira } from "@/lib/utils";
import { StatusBadge } from "@/components/dashboard/ui";

export function PaymentsTable({
  payments,
}: {
  payments: {
    id: string;
    reference: string;
    amount: number;
    status: string;
    createdAt: Date;
    user: { name: string };
    enrollment: { tier: { name: string; program: { title: string } } };
  }[];
}) {
  if (payments.length === 0) return <p className="px-6 py-8 text-center text-sm text-ink-400">No payments yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-canvas/60 text-[11px] uppercase tracking-[0.08em] text-ink-500">
          <tr>
            <th className="px-6 py-2.5 font-medium">Learner</th>
            <th className="px-6 py-2.5 font-medium">Purchase</th>
            <th className="px-6 py-2.5 font-medium">Amount</th>
            <th className="px-6 py-2.5 font-medium">Status</th>
            <th className="px-6 py-2.5 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {payments.map((p) => (
            <tr key={p.id}>
              <td className="px-6 py-2.5 font-medium text-ink-900">{p.user.name}</td>
              <td className="px-6 py-3.5 text-ink-600">
                {p.enrollment.tier.program.title} — {p.enrollment.tier.name}
              </td>
              <td className="px-6 py-3.5 tabular-nums text-ink-900">{formatNaira(p.amount)}</td>
              <td className="px-6 py-3.5">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-6 py-3.5 whitespace-nowrap text-ink-500">{formatDate(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
