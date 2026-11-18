"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/client/cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Hides the default header (for fully custom content such as the command palette). */
  bare?: boolean;
  className?: string;
};

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

/**
 * Accessible modal built on the native <dialog> element.
 * Renders as a bottom sheet on phones and as a centered card on larger screens.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", bare = false, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {open ? (
        <div
          className="flex h-full w-full items-end justify-center sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
        >
          <div
            className={cn(
              "dialog-panel flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-border bg-surface shadow-float sm:rounded-[20px]",
              SIZES[size],
              className,
            )}
          >
            {bare ? (
              children
            ) : (
              <>
                <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
                  <div className="h-1 w-9 rounded-full bg-fg/15" />
                </div>
                <div className="flex items-start justify-between gap-3 px-5 pt-3 sm:px-6 sm:pt-5">
                  <div className="min-w-0">
                    {title ? <h2 className="type-display text-[24px]">{title}</h2> : null}
                    {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="-mr-2 -mt-1 rounded-full p-2 text-muted transition-[background-color,color,transform] duration-200 hover:rotate-90 hover:bg-fg/[0.06] hover:text-fg"
                    aria-label="Schließen"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
                {footer ? (
                  <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-2/40 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
                    {footer}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
