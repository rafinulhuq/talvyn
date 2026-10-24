import { clsx } from "clsx";
import { fieldClasses } from "./fieldClasses";

interface Props {
  scheduleMode: "now" | "later";
  onScheduleModeChange: (mode: "now" | "later") => void;
  scheduleAt: string;
  onScheduleAtChange: (value: string) => void;
}

export function ScheduleField({
  scheduleMode,
  onScheduleModeChange,
  scheduleAt,
  onScheduleAtChange,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">When to publish</h3>
      <div className="flex gap-1 rounded-lg bg-[#181A1F] border border-white/10 p-1">
        {(["now", "later"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onScheduleModeChange(mode)}
            className={clsx(
              "flex-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors",
              scheduleMode === mode
                ? "bg-[#F2D74E] text-[#1A1600] shadow-sm"
                : "text-white/80 hover:text-white hover:bg-white/10"
            )}
          >
            {mode === "now" ? "Publish now" : "Schedule for later"}
          </button>
        ))}
      </div>
      {scheduleMode === "later" && (
        <input
          type="datetime-local"
          aria-label="Scheduled publish date and time"
          value={scheduleAt}
          onChange={(event) => onScheduleAtChange(event.target.value)}
          className={fieldClasses("mt-2")}
        />
      )}
    </div>
  );
}
