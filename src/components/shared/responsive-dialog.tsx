"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

/**
 * A centred dialog from 640 px up and a bottom sheet below that (HANDOFF 8).
 * One popup, restyled with CSS, so there is no JS breakpoint and no hydration
 * mismatch. Focus is trapped, Esc and a click on the overlay close it.
 *
 * Usage:
 *   <ResponsiveDialog open={open} onOpenChange={setOpen}>
 *     <ResponsiveDialogContent closeLabel={t("close")}>
 *       <ResponsiveDialogHeader>
 *         <ResponsiveDialogTitle>...</ResponsiveDialogTitle>
 *         <ResponsiveDialogDescription>...</ResponsiveDialogDescription>   (optional)
 *       </ResponsiveDialogHeader>
 *       <ResponsiveDialogForm action={...}>                                (or a plain div)
 *         <ResponsiveDialogBody>fields</ResponsiveDialogBody>
 *         <ResponsiveDialogFooter>buttons</ResponsiveDialogFooter>
 *       </ResponsiveDialogForm>
 *     </ResponsiveDialogContent>
 *   </ResponsiveDialog>
 *
 * The body scrolls, the header and the footer stay in view.
 */
function ResponsiveDialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="responsive-dialog" {...props} />;
}

function ResponsiveDialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="responsive-dialog-trigger" {...props} />;
}

function ResponsiveDialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="responsive-dialog-close" {...props} />;
}

type ContentProps = DialogPrimitive.Popup.Props & {
  /** Accessible name of the corner close button (translated by the caller). */
  closeLabel: string;
  showCloseButton?: boolean;
  /** Dialog width from 640 px up. Default "md" (32rem). */
  size?: "sm" | "md" | "lg";
};

const widths = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
} as const;

function ResponsiveDialogContent({
  className,
  children,
  closeLabel,
  showCloseButton = true,
  size = "md",
  ...props
}: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="responsive-dialog-overlay"
        className="fixed inset-0 isolate z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs"
      />
      <DialogPrimitive.Popup
        data-slot="responsive-dialog-content"
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden bg-popover text-sm text-popover-foreground shadow-lg outline-none ring-1 ring-foreground/10",
          // phone: bottom sheet
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl transition duration-200 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full",
          // 640 px and up: centred dialog
          "sm:inset-auto sm:start-1/2 sm:top-1/2 sm:max-h-[90dvh] sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl rtl:sm:translate-x-1/2",
          "sm:data-ending-style:-translate-y-1/2 sm:data-ending-style:opacity-0 sm:data-starting-style:-translate-y-1/2 sm:data-starting-style:opacity-0",
          widths[size],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="responsive-dialog-close"
            aria-label={closeLabel}
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute end-3 top-3 text-muted-foreground"
              />
            }
          >
            <XIcon aria-hidden="true" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="responsive-dialog-header"
      className={cn("flex shrink-0 flex-col gap-1 px-5 pb-3 pe-12 pt-5", className)}
      {...props}
    />
  );
}

function ResponsiveDialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="responsive-dialog-title"
      className={cn("font-heading text-[17px] font-bold leading-snug", className)}
      {...props}
    />
  );
}

function ResponsiveDialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="responsive-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** A <form> that lays out body + footer inside the popup. Use a div if there is no form. */
function ResponsiveDialogForm({ className, ...props }: React.ComponentProps<"form">) {
  return (
    <form
      data-slot="responsive-dialog-form"
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      {...props}
    />
  );
}

/** Scrollable area between header and footer. */
function ResponsiveDialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="responsive-dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2", className)}
      {...props}
    />
  );
}

/** Sticky footer with safe-area padding for phones with a home indicator. */
function ResponsiveDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="responsive-dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-popover px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-4",
        className,
      )}
      {...props}
    />
  );
}

export {
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogForm,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
};
