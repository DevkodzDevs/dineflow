import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Flame, ClipboardList, Activity, AlertTriangle, ChevronRight } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/live";
import { cacheGet, cacheSet } from "@/lib/cache";
import { Screen, Inset, Cell, Value, Flip, ThemeToggle } from "@/components/ui";
import { C, F } from "@/lib/theme";
import { formatINR } from "@dineflow/shared";

const TABS = ["home", "tables", "kitchen", "pulse", "more"];
type D = { sales: number; bills: number; open: number; kots: number; ready: number; late: number; low: { id: string; name: string; unit: string; current_stock: number }[]; tables: number; occupied: number; waiting: number };
const empty: D = { sales: 0, bills: 0, open: 0, kots: 0, ready: 0, late: 0, low: [], tables: 0, occupied: 0, waiting: 0 };

/**
 * Today. The money first because that is what the owner opens the app for; then the three numbers
 * that matter right now as flip tiles that fill the width; then only what needs a hand.
 */
export default function Home() {
  const { profile, restaurant, membership } = useAuth(); const router = useRouter(); const { width } = useWindowDimensions();
  const [d, setD] = useState<D>(empty); const [refreshing, setRefreshing] = useState(false);
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  useEffect(() => { void cacheGet<D>("home").then((c) => { if (c) setD(c.v); }); }, []);
  const load = useCallback(async () => {
    const [b, o, k, l, t, w] = await Promise.all([
      supabase.from("bills").select("total").eq("status", "paid").gte("paid_at", `${today}T00:00:00+05:30`),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("kots").select("status, created_at").in("status", ["pending", "preparing", "ready"]),
      supabase.from("v_low_stock").select("id, name, unit, current_stock").limit(4),
      supabase.from("dining_tables").select("status"),
      supabase.from("walkins").select("id", { count: "exact", head: true }).eq("status", "waiting"),
    ]);
    const kots = k.data ?? [];
    const next: D = { sales: (b.data ?? []).reduce((s, x) => s + Number(x.total), 0), bills: b.data?.length ?? 0, open: o.count ?? 0, kots: kots.length, ready: kots.filter((x) => x.status === "ready").length,
      late: kots.filter((x) => x.status !== "ready" && Date.now() - new Date(x.created_at).getTime() > 15 * 60000).length, low: l.data ?? [], tables: (t.data ?? []).length, occupied: (t.data ?? []).filter((x) => x.status === "occupied").length, waiting: w.count ?? 0 };
    setD(next); void cacheSet("home", next);
  }, [today]);
  useLive(["orders", "order_items", "kots", "ingredients", "bills", "walkins"], () => { void load(); });
  const tile = Math.floor((width - 40 - 24) / 3);   // three tiles fill the width, edge to edge
  const needs = [
    d.late > 0 && { icon: <Flame size={20} color={C.red} />, title: `${d.late} ticket${d.late > 1 ? "s" : ""} over 15 minutes`, detail: "Kitchen", go: "/(tabs)/kitchen", tone: "alert" as const },
    d.ready > 0 && { icon: <ClipboardList size={20} color={C.tint} />, title: `${d.ready} ready to carry out`, detail: "Kitchen", go: "/(tabs)/kitchen", tone: "live" as const },
    d.waiting > 0 && { icon: <Activity size={20} color={C.orange} />, title: `${d.waiting} waiting at the door`, detail: "Pulse", go: "/(tabs)/pulse", tone: undefined },
    d.low.length > 0 && { icon: <AlertTriangle size={20} color={C.red} />, title: `${d.low.length} below reorder`, detail: d.low.map((x) => x.name).join(", "), go: "/(tabs)/more", tone: "alert" as const },
  ].filter(Boolean) as { icon: React.ReactNode; title: string; detail: string; go: string; tone?: "live" | "alert" }[];

  return (
    <Screen tabs={TABS} title={restaurant?.name ?? "DineFlow"} subtitle={`${greet}, ${profile?.full_name?.split(" ")[0] ?? ""}${membership === "trial" ? " · trial" : ""}`} right={<ThemeToggle />} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 18 }}>
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.label2 }}>Taken today</Text>
        <Text style={{ fontFamily: F.display, fontSize: 48, lineHeight: 52, color: C.label, fontVariant: ["tabular-nums"] }}>{formatINR(d.sales)}</Text>
        <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.label2 }}>{d.bills} bills settled</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 24 }}>
        <Pressable onPress={() => router.push("/(tabs)/tables")}><Flip value={d.occupied} label={`of ${d.tables} tables`} size={tile} /></Pressable>
        <Pressable onPress={() => router.push("/(tabs)/tables")}><Flip value={d.open} label="orders" size={tile} /></Pressable>
        <Pressable onPress={() => router.push("/(tabs)/kitchen")}><Flip value={d.kots} label="in kitchen" size={tile} tone={d.late ? "alert" : d.ready ? "live" : undefined} /></Pressable>
      </View>
      <Inset header={needs.length ? "Needs a hand" : "All quiet"}>
        {needs.length === 0 && <Cell first title="Nothing is late, nothing is short" detail="Pull down to refresh" />}
        {needs.map((n, i) => <Cell key={n.title} first={i === 0} leading={n.icon} title={n.title} detail={n.detail} onPress={() => router.push(n.go as never)} />)}
      </Inset>
      <Inset header="Go to">
        <Cell first leading={<ClipboardList size={20} color={C.label2} />} title="Take an order" detail={`${d.tables - d.occupied} tables free`} onPress={() => router.push("/(tabs)/tables")} trailing={<Value tone="muted">{d.open} open</Value>} />
        <Cell leading={<Flame size={20} color={C.label2} />} title="Kitchen" onPress={() => router.push("/(tabs)/kitchen")} trailing={<Value tone={d.late ? "alert" : "muted"}>{d.kots}</Value>} />
        <Cell leading={<Activity size={20} color={C.label2} />} title="Pulse · the door" onPress={() => router.push("/(tabs)/pulse")} trailing={<Value tone={d.waiting ? "alert" : "muted"}>{d.waiting} waiting</Value>} />
      </Inset>
    </Screen>
  );
}
