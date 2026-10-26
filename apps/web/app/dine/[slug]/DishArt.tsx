"use client";
import { glyphFor } from "@/components/menu/DishGlyph";
import { cn } from "@/components/ui";

/**
 * A dish with no photo on the storefront (2026-10-27, the owner: "no image — add one based on the dish"): a drawn plate
 * in the photo's place, so every card has the same shape. The drawing is the kind of dish (`glyphFor` — fritters for a
 * pakoda, a bowl for a curry, rice for a biryani…) on a plate, on a soft wash in the veg green or the non-veg amber, with
 * a few garnish dots placed from the name, so two dishes of one kind still look different. Tokens only — it follows the theme.
 */
export function DishArt({ name, category, veg, dim, className }: { name: string; category?: string | null; veg: boolean; dim?: boolean; className?: string }) {
  const Icon = glyphFor(name, category);
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const dots = [0, 1, 2, 3, 4].map((i) => { const a = ((h >> (i * 5)) % 360) * (Math.PI / 180); const r = 40 + ((h >> (i * 3)) % 9); return { x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r, s: 4 + ((h >> i) % 4) }; });
  return (
    <span role="img" aria-label={`${name} — illustration`} data-dish-art className={cn("relative grid place-items-center overflow-hidden", dim && "grayscale", className)}
      style={{ ["--hue" as string]: veg ? "var(--color-green)" : "var(--color-orange)", background: "radial-gradient(130% 100% at 25% 15%, color-mix(in srgb, var(--hue) 26%, var(--color-bg-2)), color-mix(in srgb, var(--hue) 9%, var(--color-bg-3)) 70%)" }}>
      {dots.map((d, i) => <span key={i} aria-hidden className="absolute rounded-full" style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s, background: "color-mix(in srgb, var(--hue) 45%, transparent)" }} />)}
      <span aria-hidden className="relative h-[66%] aspect-square rounded-full grid place-items-center bg-[var(--color-bg-2)] shadow-[0_10px_24px_-12px_rgb(0_0_0/.45),inset_0_0_0_6px_color-mix(in_srgb,var(--hue)_10%,transparent)]">
        <span className="absolute inset-[16%] rounded-full border border-dashed border-[color-mix(in_srgb,var(--hue)_35%,transparent)]" />
        <Icon className="relative h-[46%] w-[46%] text-[var(--hue)]" strokeWidth={1.7} />
      </span>
    </span>
  );
}
