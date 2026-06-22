import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "px-3",
        icon: "size-9",
        sm: "h-8 px-2.5 text-xs",
      },
      variant: {
        default: "bg-neutral-900 text-white hover:bg-neutral-800",
        ghost: "hover:bg-neutral-100 hover:text-neutral-900",
        outline: "border border-neutral-200 bg-white hover:bg-neutral-50",
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
