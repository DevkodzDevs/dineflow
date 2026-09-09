import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Flame, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useLive, mins } from "@/lib/live";
import { enqueue, onQueue } from "@/lib/queue";
import { cacheGet, cacheSet } from "@/lib/cache";
import { Screen, Chips, Flip, Button } from "@/components/ui";
import { C, F } from "@/lib/theme";

type K = { id: string; kot_no: number; status: "pending" | "preparing" | "ready"; created_at: string; orders: { order_no: number; type: string; dining_tables: { name: string } | null } | null; order_items: { id: string; name_snapshot: string; qty: number; status: string; notes: string | null }[] };
const TABS = ["home", "tables", "kitchen", "pulse", "more"];
type Col = "pending" | "preparing" | "ready";

/**
 * Kitchen on a phone: one column at a time (a phone is one column wide), picked with chips that carry
 * their counts. Every ticket is a full-width paper card with the minute count as a small flip tile that
 * goes red past fifteen. Actions are 48 pt at the bottom of the card, where a thumb lands. Works with no
 * signal — the change waits in the outbox.
 */
export default function Kitchen() {
  const [kots, setKots] = useState<K[]>([]); const [col, setCol] = useState<Col>("preparing"); const [online, setOnline] = useState(true); const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { void cacheGet<K[]>("kots").then((c) => { if (c) setKots(c.v); }); const un = onQueue((q) => setOnline(q.online)); return () => { un(); }; }, []);
  const load = async () => { const { data } = await supabase.from("kots").select("id, kot_no, status, created_at, orders(order_no, type, dining_tables(name)), order_items(id, name_snapshot, qty, status, notes)").in("status", ["pending", "preparing", "ready"]).order("created_at"); if (data) { setKots(data as unknown as K[]); void cacheSet("kots", data); } };
  useLive(["kots", "order_items"], () => { void load(); });
  const setKot = async (id: string, status: Col | "served") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setKots((k) => status === "served" ? k.filter((x) => x.id !== id) : k.map((x) => x.id === id ? { ...x, status } : x));
    if (!online) { void enqueue("kot_status", { id, status }, `Kitchen · ${status}`); return; }
    await supabase.from("order_items").update({ status }).eq("kot_id", id).neq("status", "cancelled"); await supabase.from("kots").update({ status }).eq("id", id);
  };
  const toggleItem = async (i: K["order_items"][number]) => {
    Haptics.selectionAsync(); const next = i.status === "ready" ? "preparing" : "ready";
    setKots((k) => k.map((x) => ({ ...x, order_items: x.order_items.map((y) => y.id === i.id ? { ...y, status: next } : y) })));
    if (!online) { void enqueue("item_status", { ids: [i.id], status: next }, `Kitchen · ${i.name_snapshot}`); return; }
    await supabase.from("order_items").update({ status: next }).eq("id", i.id);
  };
  const count = (c: Col) => kots.filter((k) => k.status === c).length;
  const list = kots.filter((k) => k.status === col);
  const where = (k: K) => k.orders?.dining_tables?.name ?? (k.orders?.type === "takeaway" ? "Takeaway" : k.orders?.type === "room_service" ? "Room" : "Delivery");
  const late = kots.filter((k) => k.status !== "ready" && mins(k.created_at) >= 15).length;
  return (
    <Screen tabs={TABS} title={kots.length ? `${kots.length} live` : "All clear"} subtitle="Kitchen" right={<Flip value={late} label="late" size={56} tone={late ? "alert" : undefined} />}
      refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
        <Chips value={col} onChange={setCol} options={[{ v: "pending", label: `New · ${count("pending")}` }, { v: "preparing", label: `Cooking · ${count("preparing")}` }, { v: "ready", label: `Ready · ${count("ready")}` }]} />
      </View>
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        {list.length === 0 && <Text style={{ fontFamily: F.sans, color: C.label2, paddingVertical: 24, textAlign: "center" }}>Nothing here right now.</Text>}
        {list.map((k) => { const age = mins(k.created_at); const isLate = col !== "ready" && age >= 15; return (
          <View key={k.id} style={{ backgroundColor: C.paper, borderRadius: 16, padding: 16, borderLeftWidth: 4, borderLeftColor: isLate ? "#ff453a" : col === "ready" ? "#4cd964" : col === "preparing" ? "#ffb340" : "#c8c8c0" }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <View style={{ flex: 1 }}><Text style={{ fontFamily: F.display, fontSize: 11, letterSpacing: 1.6, color: "#6b6b66" }}>KOT #{k.kot_no} · ORDER #{k.orders?.order_no}</Text><Text style={{ fontFamily: F.sansBold, fontWeight: "700", fontSize: 20, color: "#14231d", marginTop: 2 }}>{where(k)}</Text></View>
              <Flip value={age} label="min" size={44} tone={isLate ? "alert" : col === "ready" ? "live" : undefined} />
            </View>
            <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "rgba(20,35,29,.25)", marginVertical: 10 }} />
            {k.order_items.filter((i) => i.status !== "cancelled").map((i) => (
              <Pressable key={i.id} disabled={col === "ready"} onPress={() => toggleItem(i)} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", minHeight: 40 }}>
                <Text style={{ fontFamily: F.display, fontSize: 20, color: "#14231d", width: 28 }}>{i.qty}</Text>
                <View style={{ flex: 1 }}><Text style={{ fontFamily: F.sansBold, fontWeight: "600", fontSize: 17, color: i.status === "ready" ? "#8a8a84" : "#14231d", textDecorationLine: i.status === "ready" ? "line-through" : "none" }}>{i.name_snapshot}</Text>{i.notes && <Text style={{ fontFamily: F.sans, fontSize: 13, color: "#c0392b" }}>{i.notes}</Text>}</View>
                {i.status === "ready" && col !== "ready" && <Check size={18} color="#2fb84d" />}
              </Pressable>))}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              {col === "pending" && <Button title="Start cooking" icon={<Flame size={16} color={C.onTint} />} onPress={() => setKot(k.id, "preparing")} style={{ flex: 1 }} />}
              {col === "preparing" && <Button title="All ready" variant="ink" icon={<Check size={16} color={C.bg} />} onPress={() => setKot(k.id, "ready")} style={{ flex: 1 }} />}
              {col === "ready" && <Button title="Picked up" variant="gray" onPress={() => setKot(k.id, "served")} style={{ flex: 1 }} />}
            </View>
          </View>); })}
      </View>
    </Screen>
  );
}
