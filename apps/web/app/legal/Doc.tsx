import type { ReactNode } from "react";
import { COMPANY } from "@/lib/company";

/**
 * The pieces every legal page is built from. Plain, readable, and — importantly — honest about
 * what is not filled in: a fact the owner has not supplied renders as a visible amber gap, never
 * as a plausible-looking placeholder. A registered address nobody noticed was fake is worse than
 * one that is obviously absent.
 */

export function Doc({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <article>
      <h1 className="text-3xl md:text-4xl">{title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-steel">{intro}</p>
      <p className="mt-2 text-xs text-steel num">In effect from {COMPANY.effective}</p>
      <div className="hairline-gold my-7" />
      <div className="space-y-7">{children}</div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl md:text-[22px] mb-2.5">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-3">{children}</div>
    </section>
  );
}

export const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;

export const Bullets = ({ items }: { items: ReactNode[] }) => (
  <ul className="space-y-2 pl-1">
    {items.map((t, i) => (
      <li key={i} className="flex gap-2.5">
        <span className="mt-[9px] h-1 w-1 rounded-full bg-[var(--color-tint)] shrink-0" />
        <span className="flex-1">{t}</span>
      </li>
    ))}
  </ul>
);

/** A two-column table of terms, used for the definitions and the data-we-hold lists. */
export const Defs = ({ rows }: { rows: [ReactNode, ReactNode][] }) => (
  <div className="rounded-2xl border border-line divide-y divide-line">
    {rows.map(([k, v], i) => (
      <div key={i} className="grid sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-3">
        <div className="font-semibold text-ink">{k}</div>
        <div className="text-steel">{v}</div>
      </div>
    ))}
  </div>
);

/** A fact the owner still has to supply. Loud on purpose. */
export const Blank = ({ what }: { what: string }) => (
  <span className="inline-flex items-center rounded-md px-1.5 py-0.5 mx-0.5 text-[13px] font-semibold align-baseline bg-[rgb(255_179_64/.16)] text-[var(--color-orange)]"
    title="Set this in apps/web/lib/company.ts before publishing">[{what} — not set]</span>
);

/** The registered name wherever the documents refer to the company. */
export const Us = () => (COMPANY.legalName ? <b>{COMPANY.legalName}</b> : <Blank what="registered name" />);

export const Mail = ({ to }: { to: string }) => <a href={`mailto:${to}`} className="underline font-semibold">{to}</a>;
