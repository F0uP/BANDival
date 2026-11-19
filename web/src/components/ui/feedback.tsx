"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/client/cn";
import { t } from "@/lib/i18n";

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string; leaving?: boolean };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error(t("useToast must be used inside <FeedbackProvider>"));
  }
  return context;
}

const TONE_ICON = {
  success: <CheckCircle2 className="size-4 text-success" />,
  error: <XCircle className="size-4 text-danger" />,
  info: <Info className="size-4 text-fg" />,
};

/* -------------------------------------------------------------------------- */
/* Confirm / prompt                                                           */
/* -------------------------------------------------------------------------- */

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  /** When set, a text input is shown and its value is returned. */
  input?: { label?: string; defaultValue?: string; placeholder?: string; type?: string; multiline?: boolean; allowEmpty?: boolean };
};

type ConfirmState = ConfirmOptions & { resolve: (value: string | boolean | null) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<string | boolean | null>) | null>(null);

/** `await confirm({...})` resolves to true/false – or to the entered text (or null) when `input` is used. */
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error(t("useConfirm must be used inside <FeedbackProvider>"));
  }
  return context;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [inputValue, setInputValue] = useState("");

  // Toasts leave with a short fade before they are removed.
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 200);
  }, []);

  const push = useCallback((tone: ToastTone, message: string) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((current) => [...current.slice(-3), { id, tone, message }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 6000 : 3500);
  }, [dismiss]);

  const toastApi = useMemo<ToastApi>(() => ({
    success: (message) => push("success", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
  }), [push]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<string | boolean | null>((resolve) => {
    setInputValue(options.input?.defaultValue ?? "");
    setConfirmState({ ...options, resolve });
  }), []);

  const close = (value: string | boolean | null) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}

        <Dialog
          open={Boolean(confirmState)}
          onClose={() => close(confirmState?.input ? null : false)}
          title={confirmState?.title}
          description={confirmState?.description}
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => close(confirmState?.input ? null : false)}>
                {confirmState?.cancelLabel ?? t("Abbrechen")}
              </Button>
              <Button
                variant={confirmState?.tone === "danger" ? "danger" : "primary"}
                onClick={() => close(confirmState?.input ? inputValue : true)}
                disabled={Boolean(confirmState?.input) && !confirmState?.input?.allowEmpty && !inputValue.trim()}
              >
                {confirmState?.confirmLabel ?? t("Bestätigen")}
              </Button>
            </>
          )}
        >
          {confirmState?.input ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (inputValue.trim() || confirmState.input?.allowEmpty) close(inputValue);
              }}
              className="space-y-1.5"
            >
              {confirmState.input.label ? <label className="text-[13px] font-medium">{confirmState.input.label}</label> : null}
              {confirmState.input.multiline ? (
                <Textarea
                  autoFocus
                  rows={6}
                  value={inputValue}
                  placeholder={confirmState.input.placeholder}
                  onChange={(event) => setInputValue(event.target.value)}
                />
              ) : (
                <Input
                  autoFocus
                  type={confirmState.input.type ?? "text"}
                  value={inputValue}
                  placeholder={confirmState.input.placeholder}
                  onChange={(event) => setInputValue(event.target.value)}
                />
              )}
            </form>
          ) : confirmState?.tone === "danger" ? (
            <div className="flex items-center gap-2 rounded-[10px] bg-danger-soft px-3 py-2.5 text-sm text-danger">
              <AlertTriangle className="size-4 shrink-0" />
              {t("Diese Aktion kann nicht rückgängig gemacht werden.")}
            </div>
          ) : null}
        </Dialog>

        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:items-end"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={cn(
                "theme-dark pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-fg shadow-float",
              )}
              style={{ animation: toast.leaving ? "toast-out 200ms ease-in forwards" : "toast-in 420ms var(--ease-spring)" }}
            >
              <span className="mt-0.5">{TONE_ICON[toast.tone]}</span>
              <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
              <button type="button" onClick={() => dismiss(toast.id)} className="rounded-full text-muted transition-colors hover:text-fg" aria-label={t("Schließen")}>
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}
