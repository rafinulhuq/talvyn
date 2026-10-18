import { forwardRef } from "react";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-medium shadow-xs hover:shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none",
  secondary:
    "rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-medium shadow-xs focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50 disabled:pointer-events-none",
  ghost:
    "rounded-lg bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium transition-colors disabled:opacity-50",
  danger:
    "rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-medium shadow-xs hover:shadow-sm focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:opacity-50",
  outline:
    "rounded-lg border border-slate-300 bg-transparent text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-50",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs gap-1.5",
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={clsx(
          "inline-flex items-center justify-center select-none font-sans font-medium",
          "transition-all duration-150 ease-out",
          "active:scale-[0.985]",
          "disabled:active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed",
          "focus-visible:outline-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children}
        {!loading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
