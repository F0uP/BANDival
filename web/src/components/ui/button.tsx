import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/client/cn";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "subtle" | "outline-danger";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

/*
 * Buttons are pills – like the keys of a piece of gear – sitting on squarer panels.
 * Primary is ink (black by day, paper by night); the orange signal colour is reserved
 * for "accent" actions that start something (live mode, recording).
 */
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-ink-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_1px_2px_rgb(0_0_0/0.14)] hover:bg-ink/86",
  accent: "bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-accent-hover",
  secondary: "border border-border-strong/80 bg-surface text-fg hover:border-fg/25 hover:bg-surface-2/50",
  ghost: "text-fg hover:bg-fg/[0.06]",
  subtle: "bg-fg/[0.05] text-fg hover:bg-fg/[0.09]",
  danger: "bg-danger text-white hover:bg-danger/90",
  "outline-danger": "border border-danger/35 text-danger hover:bg-danger-soft",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 rounded-full px-3.5 text-[13px] [&_svg]:size-3.5",
  md: "h-10 gap-2 rounded-full px-[18px] text-sm [&_svg]:size-4",
  lg: "h-12 gap-2 rounded-full px-6 text-[15px] [&_svg]:size-[18px]",
  icon: "size-10 rounded-full [&_svg]:size-[18px]",
  "icon-sm": "size-8 rounded-full [&_svg]:size-4",
};

export function buttonClasses(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(
    "relative inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap tracking-[-0.006em]",
    "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-out-expo",
    "active:scale-[0.965] active:duration-75 disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function ButtonLink({ variant = "secondary", size = "md", icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
