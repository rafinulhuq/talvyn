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
            className="text-xs font-semibold text-white"
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
              "bg-[#181A1F] text-white",
              "shadow-xs outline-none",
              error
                ? "border-[#F87171] text-[#F87171] focus:border-[#F87171] focus:ring-1 focus:ring-[#F87171]/20"
                : "border-white/10 focus:border-[#F2D74E] focus:ring-1 focus:ring-[#F2D74E]",
              "disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/30 disabled:border-white/5 disabled:shadow-none",
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-white/70" />
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-[#F87171]">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-white/70">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

