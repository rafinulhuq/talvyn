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
    "rounded-[10px] bg-[#F2D74E] hover:bg-[#F7E27A] text-[#1A1600] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#F2D74E] focus-visible:outline-offset-3 disabled:opacity-50 disabled:pointer-events-none transform-none",
  secondary:
    "rounded-[10px] border border-white/[0.08] bg-[#181A1F] hover:border-white/[0.2] text-white font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#F2D74E] focus-visible:outline-offset-3 disabled:opacity-50 disabled:pointer-events-none transform-none",
  ghost:
    "rounded-[10px] bg-transparent border border-white/12 hover:border-white/24 text-white font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[#F2D74E] focus-visible:outline-offset-3 disabled:opacity-50 transform-none",
  danger:
    "rounded-[10px] bg-[#F87171] hover:bg-rose-500 text-[#1A1600] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#F87171] focus-visible:outline-offset-3 disabled:opacity-50 transform-none",
  outline:
    "rounded-[10px] border border-white/12 bg-transparent text-white font-medium hover:border-white/24 transition-colors focus-visible:outline-2 focus-visible:outline-[#F2D74E] focus-visible:outline-offset-3 disabled:opacity-50 transform-none",
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
          "transition-colors duration-150 ease-out",
          "disabled:opacity-60 disabled:cursor-not-allowed",
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
