"use client";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "./index";

/**
 * The one affordance for "let the model fill this in". Same shape on every screen so it is learnt
 * once: a small sparkle button beside the thing it fills. It never submits the form — the person
 * still reads what arrived and presses Save.
 */
export function AiButton({ label = "Suggest with AI", busy, className, onClick, size = "sm", disabled }: {
  label?: string; busy?: boolean; className?: string; onClick: () => void; size?: "sm" | "xs"; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled} aria-busy={busy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-tint)]/40 bg-[var(--color-green-2)] text-[var(--color-tint)] font-semibold transition hover:brightness-110 disabled:opacity-60 disabled:cursor-wait",
        size === "xs" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs",
        className,
      )}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
      {busy ? "Thinking…" : label}
    </button>
  );
}
