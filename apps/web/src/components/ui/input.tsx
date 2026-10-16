import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input ref={ref} type={type} data-slot="input"
      className={cn("ak-control-field flex h-9 w-full min-w-0 px-3 py-1 text-sm placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50", className)}
      {...props} />
  ),
);
Input.displayName = "Input";
