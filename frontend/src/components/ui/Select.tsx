import { forwardRef, useId } from "react";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, className, id, children, "aria-describedby": ariaDescribedBy, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? `select-${generatedId}`;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;
    const describedBy =
      [
        ariaDescribedBy,
        error ? errorId : null,
        helperText && !error ? helperId : null,
      ]
        .filter(Boolean)
        .join(" ") || undefined;

    return (
      <div className="flex flex-col gap-1.5 font-sans">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={clsx(
              "h-9 w-full appearance-none rounded-lg border px-3 pr-9 text-sm transition-colors",
              "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100",
              "shadow-xs outline-none",
              error
                ? "border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200 focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20"
                : "border-slate-200 dark:border-slate-800 focus:border-indigo-600 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20",
              "disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-slate-900/50 disabled:text-slate-400 disabled:border-slate-200 dark:disabled:border-slate-800 disabled:shadow-none",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-slate-500 dark:text-slate-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

