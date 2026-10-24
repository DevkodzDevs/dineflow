import type { ReactNode, ComponentType } from "react";
import { cn } from "./index";

/** The hue an empty state wears: its icon, the wash at its top and the dashed edge. Tokens only, so it is right in every theme. */
export type EmptyHue = "tint" | "blue" | "orange" | "violet" | "cyan" | "red";
const HUE: Record<EmptyHue, [string, string]> = {
  tint: ["var(--color-tint)", "var(--color-green-2)"],
  blue: ["var(--color-blue)", "var(--color-blue-2)"],
  orange: ["var(--color-orange)", "var(--color-orange-2)"],
  violet: ["var(--color-violet)", "var(--color-violet-2)"],
  cyan: ["var(--color-cyan)", "var(--color-cyan-2)"],
  red: ["var(--color-red)", "var(--color-red-2)"],
};

/**
 * An empty list, said properly (2026-10-24, the owner: "these empty sections don't look good — ultra modern").
 * A grey line ("No rooms yet.") left a big blank where the list would be. Now: a soft dashed panel washed in the section's
 * hue, the section's icon on a tile inside a slowly turning dotted ring, a bold line saying what is empty, one line on
 * what fills it, and the action that fills it.
 *
 * `size="sm"` is the row form for a list inside a column (Front desk's Arrivals / Upcoming): icon left, words, the action
 * right — 76px tall instead of ~240. Pass the icon as a component; this file has no "use client", so a server page can
 * use it only with an icon it renders itself — client screens pass the Lucide component as they already import it.
 */
export function EmptyState({ icon: Icon, title, hint, hue = "tint", actions, size = "md", className, ...rest }: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  title: ReactNode; hint?: ReactNode; hue?: EmptyHue; actions?: ReactNode; size?: "sm" | "md"; className?: string;
} & Record<`data-${string}`, string | boolean | undefined>) {
  const [hue1, hue2] = HUE[hue];
  const style = {
    ["--hue" as string]: hue1, ["--hue-2" as string]: hue2,
    background: `radial-gradient(120% 90% at ${size === "sm" ? "0% 50%" : "50% 0%"}, color-mix(in srgb, ${hue1} 9%, transparent), transparent 70%), var(--color-bg-2)`,
  };
  if (size === "sm") return (
    <div role="status" style={style} {...rest}
      className={cn("rounded-[18px] border border-dashed border-[color-mix(in_srgb,var(--hue)_32%,var(--color-separator))] px-3.5 py-3 min-h-[76px] flex items-center gap-3.5 min-w-0", className)}>
      <span className="relative h-12 w-12 shrink-0 grid place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-[15px] bg-[var(--hue-2)]" />
        <span className="relative text-[var(--hue)]"><Icon size={21} strokeWidth={2.1} aria-hidden /></span>
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[14.5px] font-bold leading-snug text-[var(--color-label)]">{title}</span>
        {hint && <span className="block text-[12.5px] leading-snug text-[var(--color-label-2)] mt-0.5">{hint}</span>}
      </span>
      {actions && <span className="shrink-0 flex items-center gap-2">{actions}</span>}
    </div>
  );
  return (
    <div role="status" style={style} {...rest}
      className={cn("relative overflow-hidden rounded-[24px] border border-dashed border-[color-mix(in_srgb,var(--hue)_32%,var(--color-separator))] px-6 py-9 sm:py-11 flex flex-col items-center text-center min-w-0", className)}>
      <span className="relative h-[88px] w-[88px] grid place-items-center" aria-hidden>
        {/* a dotted orbit that turns slowly, a hue wash, then the tile — still under reduced motion */}
        <span className="absolute inset-0 rounded-full border-2 border-dotted border-[color-mix(in_srgb,var(--hue)_38%,transparent)] animate-[spin_26s_linear_infinite] motion-reduce:animate-none" />
        <span className="absolute inset-[9px] rounded-full bg-[var(--hue-2)]" />
        <span className="relative h-12 w-12 rounded-[16px] grid place-items-center bg-[var(--color-bg-2)] text-[var(--hue)] shadow-[0_10px_24px_-14px_var(--hue),0_0_0_1px_color-mix(in_srgb,var(--hue)_18%,transparent)]">
          <Icon size={23} strokeWidth={2.1} aria-hidden />
        </span>
      </span>
      <div className="mt-4 text-[17px] font-bold leading-snug text-[var(--color-label)] max-w-[34ch]">{title}</div>
      {hint && <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-label-2)] max-w-[44ch]">{hint}</p>}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
