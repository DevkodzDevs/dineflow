import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { PayoutsClient, type Settlement } from "./PayoutsClient";
export const metadata = { title: "Payouts" };
export const dynamic = "force-dynamic";

/** What Swiggy and Zomato paid against what their orders said they would (0105). Owner or manager. */
export default async function PayoutsPage() {
  const session = await requireSession();
  if (!["owner", "manager"].includes(session.profile.role)) redirect("/online-orders?locked=payouts");
  const s = await createClient();
  const [{ data: channels }, { data: rows }] = await Promise.all([
    // your own website is paid to you directly: only the aggregators pay out against their orders
    s.from("order_channels").select("id, kind, label").neq("kind", "website").order("label"),
    s.from("channel_settlements").select("*").order("period_to", { ascending: false }).limit(100),
  ]);
  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div><div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">Online orders</div><h1 className="text-3xl">Payouts</h1></div>
      </div>
      <PayoutsClient channels={channels ?? []} rows={(rows ?? []) as Settlement[]} today={todayIST()} />
    </>
  );
}
