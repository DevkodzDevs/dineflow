import { useEffect, useState } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Plus, ShoppingBag } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useLive, mins } from "@/lib/live";
import { cacheGet, cacheSet } from "@/lib/cache";
import { Screen, Chips, IconButton, Flip } from "@/components/ui";
import { C, F, shadow } from "@/lib/theme";
import { formatINR } from "@dineflow/shared";

type T = { id: string; name: string; capacity: number; zone: string; status: string };
type O = { id: string; order_no: number; type: string; table_id: string | null; customer_name: string | null; created_at: string; order_items: { qty: number; price_snapshot: number; status: string }[] };
const TABS = ["home", "tables", "kitchen", "pulse", "more"];

/**
 * The floor on a phone: a grid of table cards two across, the zone picked with chips, each card
 * carrying its state as a colour and one line — free · cooking 12 min · served ₹860. Tap to order.
 */
export default function Tables() {
  const router = useRouter(); const { width } = useWindowDimensions();
  const [tables, setTables] = useState<T[]>([]); const [orders, setOrders] = useState<O[]>([]); const [zone, setZone] = useState<string>("all"); const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { void cacheGet<{ t: T[]; o: O[] }>("tables").then((c) => { if (c) { setTables(c.v.t); setOrders(c.v.o); } }); }, []);
  const load = async () => {
    const [t, o] = await Promise.all([supabase.from("dining_tables").select("*").order("sort_order"), supabase.from("orders").select("id, order_no, type, table_id, customer_name, created_at, order_items(qty, price_snapshot, status)").eq("status", "open").order("created_at")]);
    setTables((t.data ?? []) as T[]); setOrders((o.data ?? []) as O[]); void cacheSet("tables", { t: t.data ?? [], o: o.data ?? [] });
  };
  useLive(["orders", "order_items", "dining_tables"], () => { void load(); });
  const byTable = Object.fromEntries(orders.filter((o) => o.table_id).map((o) => [o.table_id!, o]));
  const total = (o: O) => o.order_items.filter((i) => i.status !== "cancelled").reduce((s, i) => s + i.qty * Number(i.price_snapshot), 0);
  const stage = (o: O) => { const l = o.order_items.filter((i) => i.status !== "cancelled"); return l.some((i) => i.status === "pending") ? "waiting" : l.some((i) => i.status === "preparing") ? "cooking" : "served"; };
  const zones = ["all", ...new Set(tables.map((t) => t.zone))];
  const list = tables.filter((t) => zone === "all" || t.zone === zone);
  const takeaways = orders.filter((o) => !o.table_id);
  const cardW = Math.floor((width - 40 - 12) / 2);
  const tone = (s: string) => s === "cooking" ? C.orange : s === "served" ? C.tint : s === "waiting" ? C.label2 : C.line;
  return (
    <Screen tabs={TABS} title="Orders" subtitle={`${orders.length} open · ${tables.length - Object.keys(byTable).length} tables free`} right={<IconButton label="Takeaway order" icon={<ShoppingBag size={20} color={C.label} />} onPress={() => router.push("/order/new")} />}
      refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      {zones.length > 2 && <View style={{ paddingHorizontal: 20, marginBottom: 16 }}><Chips value={zone} onChange={setZone} options={zones.map((z) => ({ v: z, label: z === "all" ? "All" : z }))} /></View>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20 }}>
        {list.map((t) => { const o = byTable[t.id]; const s = o ? stage(o) : "free"; return (
          <Pressable key={t.id} onPress={() => router.push(o ? `/order/${o.id}` : { pathname: "/order/new", params: { table: t.id } } as never)} style={({ pressed }) => ({ width: cardW, aspectRatio: 1.25, borderRadius: 18, padding: 14, backgroundColor: C.card, borderWidth: 1, borderColor: o ? tone(s) : C.line, justifyContent: "space-between", transform: [{ scale: pressed ? 0.97 : 1 }], ...shadow })}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}><Text style={{ fontFamily: F.display, fontSize: 30, color: C.label }}>{t.name}</Text><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.label2 }}>{t.capacity} seats</Text></View>
            {o ? <View><Text style={{ fontFamily: F.display, fontSize: 20, color: C.label }}>{formatINR(total(o))}</Text><Text style={{ fontFamily: F.sans, fontSize: 12, color: tone(s) }}>{s} · {mins(o.created_at)} min</Text></View>
               : <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.tint }} /><Text style={{ fontFamily: F.sans, fontSize: 13, color: C.label2 }}>free · tap to order</Text></View>}
          </Pressable>); })}
      </View>
      {takeaways.length > 0 && <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Text style={{ fontFamily: F.display, fontSize: 13, letterSpacing: 0.8, color: C.label2, marginBottom: 8 }}>Takeaway & delivery · {takeaways.length}</Text>
        <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 0.5, borderColor: C.line, overflow: "hidden" }}>{takeaways.map((o, i) => <Pressable key={o.id} onPress={() => router.push(`/order/${o.id}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, borderTopWidth: i ? 0.5 : 0, borderTopColor: C.line }}><Flip value={o.order_no % 100} size={36} pad={2} /><View style={{ flex: 1 }}><Text style={{ fontFamily: F.sans, fontSize: 15, color: C.label }}>{o.customer_name ?? o.type}</Text><Text style={{ fontFamily: F.sans, fontSize: 12, color: tone(stage(o)) }}>{stage(o)} · {mins(o.created_at)} min</Text></View><Text style={{ fontFamily: F.display, fontSize: 17, color: C.label }}>{formatINR(total(o))}</Text></Pressable>)}</View>
      </View>}
      <View style={{ position: "absolute", right: 20, bottom: 110 }}><Pressable onPress={() => router.push("/order/new")} style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: C.tint, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.94 : 1 }], ...shadow })} accessibilityLabel="New order"><Plus size={26} color={C.onTint} /></Pressable></View>
    </Screen>
  );
}
