import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Empty, Pill, StatTile } from "@/components/ui";
import { formatINR, fmtTime, minsSince, todayIST } from "@/lib/format";
import { DayClose } from "./DayClose";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const s = await createClient();
  const today = todayIST();
  const [{ data: open }, { data: bills }, { data: closes }] = await Promise.all([
    s.from("orders").select("id, order_no, type, customer_name, created_at, dining_tables(name), order_items(qty, price_snapshot, status)").eq("status", "open").order("created_at"),
    s.from("bills").select("id, bill_no, total, status, created_at, paid_at, orders(order_no, dining_tables(name)), payments(method, amount)").gte("created_at", `${today}T00:00:00+05:30`).order("created_at", { ascending: false }),
    s.from("day_closes").select("business_date, total_sales, orders_count").order("business_date", { ascending: false }).limit(1),
  ]);
  const paid = (bills ?? []).filter((b) => b.status === "paid");
  const sales = paid.reduce((t, b) => t + Number(b.total), 0);
  const by = (m: string) => paid.flatMap((b) => b.payments as { method: string; amount: number }[]).filter((p) => p.method === m).reduce((t, p) => t + Number(p.amount), 0);
  return (
    <>
      <PageHeader eyebrow="Cash & counter" title="Billing" actions={<DayClose today={today} lastClosed={closes?.[0]?.business_date ?? null} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatTile label="Today's sales" value={formatINR(sales)} sub={`${paid.length} bills`} />
        <StatTile label="Cash" value={formatINR(by("cash"))} delay={0.05} />
        <StatTile label="UPI" value={formatINR(by("upi"))} delay={0.1} />
        <StatTile label="Card" value={formatINR(by("card"))} delay={0.15} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel mb-3">Ready to bill · {open?.length ?? 0}</div>
          {!open?.length ? <Empty title="No open orders" hint="Bills appear here as soon as an order is placed." /> : (
            <div className="space-y-3">{open.map((o) => {
              const total = (o.order_items as { qty: number; price_snapshot: number; status: string }[]).filter((i) => i.status !== "cancelled").reduce((t, i) => t + i.qty * Number(i.price_snapshot), 0);
              const t = o.dining_tables as unknown as { name: string } | null;
              return (
                <Link key={o.id} href={`/billing/${o.id}`} className="feather feather-lift flex items-center gap-4 p-4">
                  <div className="font-display text-2xl w-14">{t?.name ?? (o.type === "takeaway" ? "TA" : "DL")}</div>
                  <div className="flex-1 min-w-0"><div className="font-semibold truncate">Order #{o.order_no}{o.customer_name ? ` · ${o.customer_name}` : ""}</div><div className="text-xs text-steel num">{minsSince(o.created_at)} min open</div></div>
                  <div className="num font-semibold">{formatINR(total)}</div>
                </Link>
              );
            })}</div>
          )}
        </section>
        <section>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel mb-3">Today's bills</div>
          <div className="feather divide-y divide-line">
            {!bills?.length && <p className="p-6 text-sm text-steel">No bills yet today.</p>}
            {bills?.map((b) => {
              const o = b.orders as unknown as { order_no: number; dining_tables: { name: string } | null } | null;
              return (
                <Link key={b.id} href={`/billing/${b.id}?bill=1`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-porcelain">
                  <span className="num text-steel w-14">#{b.bill_no}</span><span className="flex-1 truncate">{o?.dining_tables?.name ?? "Takeaway"} · order #{o?.order_no}</span>
                  <Pill tone={b.status === "paid" ? "ready" : b.status === "void" ? "alert" : "pending"}>{b.status}</Pill>
                  <span className="num font-semibold w-24 text-right">{formatINR(Number(b.total))}</span><span className="num text-xs text-steel hidden sm:block">{fmtTime(b.paid_at ?? b.created_at)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
