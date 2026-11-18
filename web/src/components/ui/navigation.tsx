"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/client/cn";
import { useSlidingIndicator } from "@/lib/client/use-indicator";

/* -------------------------------------------------------------------------- */
/* Tabs (underline style, horizontally scrollable on phones)                  */
/* -------------------------------------------------------------------------- */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: ReactNode; count?: number }>;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(listRef, barRef, value, { mode: "underline" });

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = items[(index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
    onChange(next.value);
  };

  return (
    <div ref={listRef} role="tablist" className={cn("scrollbar-none relative -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0", className)}>
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            data-active={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 px-3 pb-3 pt-2.5 text-sm font-medium transition-colors duration-200",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {item.label}
            {item.count ? <span className="font-mono text-[11px] tabular-nums text-subtle">{item.count}</span> : null}
          </button>
        );
      })}
      <span ref={barRef} className="indicator top-auto bottom-0 h-[2px] rounded-full bg-fg" aria-hidden />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  size = "md",
  className,
}: {
  value: T | null;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: ReactNode; activeClass?: string; title?: string }>;
  size?: "sm" | "md";
  className?: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(groupRef, thumbRef, value ?? "");

  return (
    <div ref={groupRef} className={cn("relative inline-flex rounded-full bg-fg/[0.055] p-[3px]", className)} role="radiogroup">
      <span
        ref={thumbRef}
        className="indicator rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.1),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-surface-3 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
        aria-hidden
      />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active}
            title={item.title}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative z-[1] inline-flex flex-1 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-200 [&_svg]:size-3.5",
              size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[13px]",
              active ? cn("text-fg", item.activeClass) : "text-muted hover:text-fg",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Dropdown menu                                                              */
/* -------------------------------------------------------------------------- */

export type MenuItem =
  | { type?: "item"; label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: ReactNode }
  | { type: "separator" }
  | { type: "label"; label: ReactNode };

type MenuPosition = { top?: number; bottom?: number; left?: number; right?: number; minWidth: number };

export function Menu({
  trigger,
  items,
  align = "end",
  className,
  side = "bottom",
}: {
  trigger: (props: { open: boolean; toggle: (event: ReactMouseEvent<HTMLElement>) => void }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  side?: "bottom" | "top";
  className?: string;
}) {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  // Rendered in a portal with fixed positioning so lists with overflow:hidden never clip it.
  const toggle = (event: ReactMouseEvent<HTMLElement>) => {
    if (open) {
      setPosition(null);
      return;
    }
    const element = event.currentTarget.closest("[data-menu-root]") ?? event.currentTarget;
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placeTop = side === "top" ? spaceAbove > 220 || spaceAbove > spaceBelow : spaceBelow < 260 && spaceAbove > spaceBelow;
    const next: MenuPosition = { minWidth: Math.max(208, rect.width) };
    if (placeTop) next.bottom = viewportHeight - rect.top + 6;
    else next.top = rect.bottom + 6;
    if (align === "end") next.right = Math.max(8, viewportWidth - rect.right);
    else next.left = Math.max(8, Math.min(rect.left, viewportWidth - next.minWidth - 8));
    // Inside a modal <dialog> everything outside is inert – render into the dialog instead.
    setPortalTarget(element.closest("dialog[open]") ?? document.body);
    setPosition(next);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onScroll = (event: Event) => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <div ref={ref} data-menu-root="" className={cn("relative", className)}>
      {trigger({ open, toggle })}
      {position && portalTarget ? createPortal(
        <div
          ref={panelRef}
          role="menu"
          className="fixed z-[60] max-h-[min(70dvh,28rem)] overflow-y-auto rounded-[14px] border border-border bg-surface p-1 text-fg shadow-float"
          style={{
            ...position,
            animation: "pop-in 200ms var(--ease-out)",
            transformOrigin: `${position.left !== undefined ? "left" : "right"} ${position.top !== undefined ? "top" : "bottom"}`,
          }}
        >
          {items.map((item, index) => {
            if (item.type === "separator") {
              return <div key={index} className="my-1 h-px bg-border" />;
            }
            if (item.type === "label") {
              return <div key={index} className="type-eyebrow px-2.5 pb-1.5 pt-2.5 text-subtle">{item.label}</div>;
            }
            return (
              <button
                key={index}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setPosition(null);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm transition-colors duration-150 disabled:opacity-50 [&_svg]:size-4",
                  item.danger ? "text-danger hover:bg-danger-soft" : "hover:bg-fg/[0.05]",
                )}
              >
                {item.icon ? <span className={cn("shrink-0", !item.danger && "text-muted")}>{item.icon}</span> : null}
                <span className="flex-1 truncate">{item.label}</span>
                {item.hint ? <span className="text-xs text-subtle">{item.hint}</span> : null}
              </button>
            );
          })}
        </div>,
        portalTarget,
      ) : null}
    </div>
  );
}
