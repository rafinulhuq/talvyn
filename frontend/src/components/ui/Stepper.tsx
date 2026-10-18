import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { clsx } from "clsx";

export type StepStatus = "done" | "current" | "upcoming" | "blocked";

export interface StepperStep {
  id: string;
  label: string;
  status: StepStatus;
  href?: string;
}

interface StepperProps {
  steps: StepperStep[];
  className?: string;
}

const dotClasses: Record<StepStatus, string> = {
  done: "bg-indigo-600 text-white border border-indigo-600",
  current: "bg-indigo-50 text-indigo-600 border-2 border-indigo-600 shadow-xs",
  upcoming: "bg-white dark:bg-slate-900 text-slate-400 border border-slate-300 dark:border-slate-700",
  blocked: "bg-rose-50 text-rose-600 border border-rose-300 dark:bg-rose-950/40 dark:border-rose-800",
};

const labelClasses: Record<StepStatus, string> = {
  done: "text-slate-600 dark:text-slate-400 text-xs font-medium",
  current: "text-xs font-semibold text-indigo-600 dark:text-indigo-400",
  upcoming: "text-xs text-slate-400 dark:text-slate-500",
  blocked: "text-xs text-rose-600 dark:text-rose-400 font-medium",
};

export function Stepper({ steps, className }: StepperProps) {
  return (
    <ol
      className={clsx(
        "scroll-row -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5",
        className
      )}
    >
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const dot = (
          <span
            className={clsx(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-all",
              dotClasses[step.status]
            )}
          >
            {step.status === "done" ? (
              <Check className="h-3 w-3 stroke-[2.5]" />
            ) : step.status === "blocked" ? (
              <Lock className="h-2.5 w-2.5" />
            ) : (
              i + 1
            )}
          </span>
        );

        const content = (
          <span className="flex items-center gap-2 whitespace-nowrap text-xs">
            {dot}
            <span className={clsx("transition-colors", labelClasses[step.status])}>
              {step.label}
            </span>
          </span>
        );

        return (
          <li key={step.id} className="flex items-center gap-2">
            {step.href && step.status !== "blocked" ? (
              <Link
                href={step.href}
                className="rounded-md p-1 transition-opacity hover:opacity-80"
              >
                {content}
              </Link>
            ) : (
              <div className="p-1">{content}</div>
            )}
            {!isLast && (
              <span className="h-[1.5px] w-4 shrink-0 bg-slate-200 dark:bg-slate-700" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

