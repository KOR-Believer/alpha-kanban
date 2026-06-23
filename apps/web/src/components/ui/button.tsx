import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ak-focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-[var(--ak-radius-md)] text-sm font-medium leading-none transition-[background,border-color,color,box-shadow,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
  {
    defaultVariants: {
      size: "default",
      variant: "primary",
    },
    variants: {
      size: {
        default: "px-3.5",
        icon: "size-9",
        iconSm: "size-8",
        sm: "h-8 px-3 text-xs",
      },
      variant: {
        default:
          "border border-[var(--ak-hairline)] bg-[var(--ak-surface)] text-[var(--ak-ink-secondary)] hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]",
        ghost:
          "bg-transparent text-[var(--ak-ink-muted)] hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]",
        outline:
          "border border-[var(--ak-hairline)] bg-[var(--ak-surface)] text-[var(--ak-ink-secondary)] shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:bg-[var(--ak-surface-hover)] hover:text-[var(--ak-ink)]",
        primary:
          "border border-[var(--ak-primary)] bg-[var(--ak-primary)] text-white shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:bg-[var(--ak-primary-active)] hover:border-[var(--ak-primary-active)]",
      },
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  ),
);
Button.displayName = "Button";
