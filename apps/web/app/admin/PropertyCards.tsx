"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Building2, Palmtree, UtensilsCrossed, Cpu, ChevronDown } from "lucide-react";
import { formatINR, type PropertyType } from "@dineflow/shared";
import { daysLeft } from "@/lib/format";
import styles from "./PropertyCards.module.css";

type Row = { id: string; name: string; property_type: PropertyType; membership: string; trial_ends_at: string; membership_ends_at: string | null; users: number; sales_today: number; sales_30d: number; open_orders: number; rooms: number; occupied_rooms: number };

const TONE: Record<string, string> = { active: "var(--color-tint)", trial: "var(--color-orange)", expired: "var(--color-red)", suspended: "var(--color-red)" };
const PAGE = 20;
/* a card's figure is a glance, not a bill: a lakh and up reads ₹12.8 L / ₹1.2 Cr (the exact sum is its title) — at 360px
   ₹12,84,310 did not fit a third of the card */
const glance = (n: number) => {
  const big = (v: number, u: string) => `₹${(v < 100 ? v.toFixed(1) : v.toFixed(0)).replace(/\.0$/, "")} ${u}`;
  return n >= 1e7 ? big(n / 1e7, "Cr") : n >= 1e5 ? big(n / 1e5, "L") : formatINR(Math.round(n), { whole: true });   // whole only drops ".00", so round first
};

/**
 * The estate on a phone and an iPad in portrait (2026-10-24, the owner: "ultra modern, user friendly, properly visible").
 * The shared DataTable's phone mode is a generic label/value stack — MEMBERSHIP, TODAY in caps down the left, a second
 * search box under the toolbar's own. Here each property is a card built for what an operator reads first: what it is
 * and its status (with the days left, red at 2 or fewer), then today / 30 days / live, then Open and the ⋯ menu.
 * From 1024px the dense table stays (AdminClient). Filtering and search are the toolbar's; this only draws `rows`.
 */
export function PropertyCards<R extends Row>({ rows, codeOf, onBox, actions, empty }: { rows: R[]; codeOf: (id: string) => string | null; onBox: (id: string) => boolean; actions: (r: R) => ReactNode; empty: ReactNode }) {
  const [shown, setShown] = useState(PAGE);
  if (!rows.length) return <div className={styles.empty} data-property-cards>{empty}</div>;
  return (
    <div data-property-cards>
      <ul className={styles.grid}>
        {rows.slice(0, shown).map((r) => {
          const end = r.membership === "trial" ? r.trial_ends_at : r.membership_ends_at;
          const left = end ? daysLeft(end) : null;
          const lodging = r.property_type !== "restaurant";
          const code = codeOf(r.id);
          const Icon = r.property_type === "hotel" ? Building2 : r.property_type === "resort" ? Palmtree : UtensilsCrossed;
          return (
            <li key={r.id} className={styles.card} style={{ "--st": TONE[r.membership] ?? "var(--color-label-3)" } as CSSProperties} data-property-card={r.name}>
              <div className={styles.head}>
                <span className={styles.icon}><Icon size={20} aria-hidden="true" />{onBox(r.id) && <span className={styles.box} title="Runs on a Box"><Cpu size={11} aria-hidden="true" /><span className="sr-only">Runs on a Box</span></span>}</span>
                <div className={styles.who}>
                  <div className={styles.name}>{r.name}</div>
                  <div className={styles.sub}>
                    {code && <span className={styles.code}>{code}</span>}
                    <span className={styles.kind}>{r.property_type}</span>
                    <span>{r.users} {r.users === 1 ? "user" : "users"}</span>
                  </div>
                </div>
                <div className={styles.status} data-membership={r.membership}>
                  <span className={styles.badge}><span className={styles.dot} aria-hidden="true" />{r.membership}</span>
                  {left !== null && <span className={left <= 2 ? `${styles.left} ${styles.soon}` : styles.left}>{left === 0 ? "ends today" : `${left} day${left === 1 ? "" : "s"} left`}</span>}
                </div>
              </div>
              <dl className={styles.figs}>
                <div><dt>Today</dt><dd className="num" title={formatINR(Number(r.sales_today))}>{glance(Number(r.sales_today))}</dd></div>
                <div><dt>30 days</dt><dd className="num" title={formatINR(Number(r.sales_30d))}>{glance(Number(r.sales_30d))}</dd></div>
                <div>
                  <dt>{lodging && r.rooms ? "Rooms" : "Live"}</dt>
                  <dd className="num">{lodging && r.rooms ? <>{r.occupied_rooms}<small>/{r.rooms}</small></> : <>{r.open_orders}<small> {r.open_orders === 1 ? "order" : "orders"}</small></>}</dd>
                </div>
              </dl>
              <div className={styles.foot}>{actions(r)}</div>
            </li>
          );
        })}
      </ul>
      {rows.length > shown && (
        <button type="button" className={styles.more} onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, rows.length - shown)} more <span className={styles.moreOf}>{shown} of {rows.length}</span><ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
