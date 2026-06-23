import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/35 data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ children, className, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 grid max-h-[min(760px,calc(100vh-2rem))] w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden rounded-lg border border-neutral-200 bg-white p-0 shadow-xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900">
        <X className="size-4" aria-hidden="true" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 px-5 pt-5", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

export const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-4",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base font-semibold tracking-normal text-neutral-950", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-neutral-500", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
