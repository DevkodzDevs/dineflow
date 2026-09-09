"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Flip } from "@/components/ui";

/**
 * The board: the three numbers that matter right now, in flip tiles you can read from the pass,
 * with today's money beside them and the date line above — the split-flap clock, put to work.
 */
export function Board({ greet, property, tiles, money, moneySub }: {
  greet: string; property: string; money: string; moneySub: string;
  tiles: { value: number | string; label: string; href: string; tone?: "live" | "alert" }[];
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const t = () => setNow(new Date()); t(); const i = setInterval(t, 30000); return () => clearInterval(i); }, []);
  const date = now ? now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Kolkata" }).replace("/", ".") : "";
  const day = now ? now.toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }) : "";
  const time = now ? now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "";
  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div><div className="text-[15px] text-[var(--color-label-2)]">{greet}</div><h1 className="text-[30px] md:text-[40px]">{property}</h1></div>
        <div className="dateline">{date} <span className="uppercase">{day}</span> <span className="num text-[var(--color-label)] ml-2">{time}</span></div>
      </div>
      <div className="mt-6 grid xl:grid-cols-[auto_1fr] gap-6 xl:gap-12 items-start">
        <div className="flip-row">
          {tiles.map((t) => <Link key={t.label} href={t.href} className="rounded-2xl focus-visible:outline-none"><Flip value={t.value} label={t.label} tone={t.tone} /></Link>)}
        </div>
        <div className="xl:pt-1 xl:border-l xl:border-[var(--color-separator)] xl:pl-12">
          <div className="text-[13px] text-[var(--color-label-2)]">Taken today</div>
          <div className="num text-[44px] md:text-[64px] leading-none mt-1">{money}</div>
          <div className="text-sm text-[var(--color-label-2)] mt-2">{moneySub}</div>
        </div>
      </div>
    </section>
  );
}
