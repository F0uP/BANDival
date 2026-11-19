"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { passwordChecks, passwordScore, type PasswordContext } from "@/lib/password-policy";
import { translatable } from "@/lib/i18n";

const SCORE_LABEL = translatable(["Sehr schwach", "Schwach", "Okay", "Stark", "Sehr stark"]);

/** Live password rules (the server enforces the same rules plus a breach check). */
export function PasswordChecklist({ password, context, className }: { password: string; context?: PasswordContext; className?: string }) {
  const checks = passwordChecks(password, context);
  const score = passwordScore(password, context);
  return (
    <div className={cn("space-y-2.5", className)} aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                password && index < score ? (score >= 3 ? "bg-success" : score >= 2 ? "bg-warning" : "bg-danger") : "bg-fg/10",
              )}
            />
          ))}
        </div>
        <span className="type-meta w-20 text-right text-[11px] text-muted">{password ? SCORE_LABEL[score] : ""}</span>
      </div>
      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={check.id} className={cn("flex items-start gap-2 text-xs transition-colors", check.ok ? "text-success" : "text-muted")}>
            {check.ok ? <Check className="mt-px size-3.5 shrink-0" /> : <X className="mt-px size-3.5 shrink-0 text-subtle" />}
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
