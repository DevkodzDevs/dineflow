"use client";
import Link from "next/link";
import { Flip } from "@/components/ui";

/**
 * The three numbers a screen is really about, in split-flap tiles.
 *
 * This app is named for these — globals.css opens by calling the whole design "a split-flap clock
 * on a graphite wall" — and they do a job no stat card does: they are legible from across a
 * kitchen, at the pass, by someone whose hands are full. Every operational screen now opens with
 * the same three-tile row so the number that matters is in the same place on all of them.
 *
 * Three, not four or six. A row that scrolls is a row nobody reads at a glance, and the tile sizes
 * itself from the viewport (clamp in .flip) on the assumption that three share the width.
 */
export type Flap = { value: number | string; label: string; href?: string; tone?: "live" | "alert" };

export function FlipRow({ tiles, className = "" }: { tiles: Flap[]; className?: string }) {
  return (
    <div className={`flip-row ${className}`}>
      {tiles.map((t) =>
        t.href
          ? <Link key={t.label} href={t.href} className="rounded-2xl focus-visible:outline-none"><Flip value={t.value} label={t.label} tone={t.tone} /></Link>
          : <Flip key={t.label} value={t.value} label={t.label} tone={t.tone} />,
      )}
    </div>
  );
}
