/** Radial meter for the overall score. Mirrors the AI Checker's gauge. */
export function ScoreGauge({ score, color }: { score: number; color: string }) {
  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${score * 3.6}deg, rgb(226 232 240) 0deg)`,
        }}
      />
      <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-900">
        <span className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50">
          {score}
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          / 100
        </span>
      </div>
    </div>
  );
}
