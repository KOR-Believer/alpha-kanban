import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "ak-focus-ring group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-2xl border border-transparent bg-clip-padding text-sm font-medium leading-none transition-all select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-8 px-3.5",
        icon: "size-8",
        iconSm: "size-7",
        sm: "h-7 px-3 text-xs",
        xs: "h-6 px-2 text-xs",
        lg: "h-9 px-4",
      },
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_0_color-mix(in_oklch,var(--foreground),transparent_92%)] hover:bg-[var(--ak-primary-active)]",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        outline:
          "border-border bg-background text-foreground shadow-[0_1px_0_color-mix(in_oklch,var(--foreground),transparent_94%)] hover:bg-muted",
        primary:
          "bg-primary text-primary-foreground shadow-[0_1px_0_color-mix(in_oklch,var(--foreground),transparent_92%)] hover:bg-[var(--ak-primary-active)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "h-auto rounded-none border-0 bg-transparent p-0 text-primary underline-offset-4 hover:underline",
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
