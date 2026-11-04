import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5 transition-colors",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        muted:
          "border-transparent bg-muted text-muted-foreground",
        outline:
          "border-border bg-background text-foreground",
        success: "border-transparent bg-[var(--ak-success-soft)] text-[color:color-mix(in_oklab,var(--ak-success),var(--foreground)_25%)]",
        warning: "border-transparent bg-[var(--ak-warning-soft)] text-[color:color-mix(in_oklab,var(--ak-warning),var(--foreground)_45%)]",
        danger: "border-transparent bg-[var(--ak-danger-soft)] text-destructive",
      },
    },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
