export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-ink-100"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}
