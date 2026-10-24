import { forwardRef, useId } from "react";
import { clsx } from "clsx";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      className,
      id,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? `input-${generatedId}`;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
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
            htmlFor={inputId}
            className="text-xs font-semibold text-white"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 flex items-center text-white/70">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={clsx(
              "h-9 w-full rounded-lg border px-3 text-sm transition-colors",
              "bg-[#181A1F] text-white placeholder:text-white/40",
              "shadow-xs outline-none",
              leftIcon && "pl-9",
              rightIcon && "pr-9",
              error
                ? "border-[#F87171] text-[#F87171] focus:border-[#F87171] focus:ring-1 focus:ring-[#F87171]/20"
                : "border-white/10 focus:border-[#F2D74E] focus:ring-1 focus:ring-[#F2D74E]",
              "disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/30 disabled:border-white/5 disabled:shadow-none",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 flex items-center text-white/70">
              {rightIcon}
            </div>
          )}
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

Input.displayName = "Input";

