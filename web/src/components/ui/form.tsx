import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/client/cn";
import { t } from "@/lib/i18n";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("field", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn("field", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn("field", className)} {...props} />;
});

/** Label + control + hint/error, with automatic id wiring. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
  optional,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  optional?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-fg">
        <span>{label}</span>
        {optional ? <span className="font-mono text-[10px] font-normal uppercase tracking-[0.06em] text-subtle">{t("optional")}</span> : null}
      </label>
      {children(id)}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs leading-relaxed text-muted">{hint}</p> : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start justify-between gap-4 py-2", disabled && "opacity-60")}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-300",
          checked ? "bg-accent" : "bg-fg/15",
        )}
      >
        <span
          className={cn(
            "inline-block size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-[420ms] ease-spring",
            checked ? "translate-x-[19px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </label>
  );
}

/** Text input that turns comma/enter separated values into removable chips. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const listId = useId();
  const add = (raw: string) => {
    const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) return;
    onChange(Array.from(new Set([...value, ...parts])).slice(0, 40));
  };
  return (
    <div className="field flex min-h-10 flex-wrap items-center gap-1.5 py-1.5">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-[13px] [animation:pop-in_220ms_var(--ease-out)]">
          {tag}
          <button
            type="button"
            className="text-muted hover:text-fg"
            aria-label={t("{tag} entfernen", { tag })}
            onClick={() => onChange(value.filter((entry) => entry !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        list={suggestions.length > 0 ? listId : undefined}
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
        placeholder={value.length === 0 ? placeholder : ""}
        onKeyDown={(event) => {
          const input = event.currentTarget;
          if ((event.key === "Enter" || event.key === ",") && input.value.trim()) {
            event.preventDefault();
            add(input.value);
            input.value = "";
          } else if (event.key === "Backspace" && !input.value && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={(event) => {
          if (event.currentTarget.value.trim()) {
            add(event.currentTarget.value);
            event.currentTarget.value = "";
          }
        }}
      />
      {suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions.filter((entry) => !value.includes(entry)).map((entry) => <option key={entry} value={entry} />)}
        </datalist>
      ) : null}
    </div>
  );
}
