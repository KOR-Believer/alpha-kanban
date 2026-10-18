import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn("ak-control-field min-h-20 w-full resize-y px-3 py-2 text-sm", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
