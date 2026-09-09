import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, Plus } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useLive, mins } from "@/lib/live";
import { Ticket } from "@/components/Ticket";
import { Button, Pill, Inset, Cell, DeckHandle, Flip } from "@/components/ui";
import { C, F, shadow } from "@/lib/theme";
import { formatINR } from "@dineflow/shared";

type Item = { id: string; kot_id: string | null; name_snapshot: string; qty: number; price_snapshot: number; status: string; notes: string | null };
type O = { id: string; order_no: number; type: string; status: string; table_id: string | null; customer_name: string | null; dining_tables: { name: string } | null; kots: { id: string; kot_no: number; status: string; created_at: string }[]; order_items: Item[] };

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter();
  const [o, setO] = useState<O | null>(null);
  useLive(["order_items", "kots"], async () => { const { data } = await supabase.from("orders").select("*, dining_tables(name), kots(id, kot_no, status, created_at), order_items(*)").eq("id", id).maybeSingle(); setO(data as O | null); }, 15000);
  if (!o) return null;
  const live = o.order_items.filter((i) => i.status !== "cancelled"); const total = live.reduce((s, i) => s + i.qty * Number(i.price_snapshot), 0);
  const tone = (s: string) => (["ready", "preparing", "served"].includes(s) ? s : "pending") as "ready" | "preparing" | "served" | "pending";
  const serve = async (kotId: string) => { await supabase.from("order_items").update({ status: "served" }).eq("kot_id", kotId).eq("status", "ready"); };
  const kotItems = (k: string) => live.filter((i) => i.kot_id === k);
  return (
    <View style={{ flex: 1, backgroundColor: C.bezel }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, marginHorizontal: 6, marginTop: 6, borderRadius: 28, overflow: "hidden" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 }}>
          <DeckHandle />
          <View style={{ flex: 1 }}><Text style={{ fontFamily: F.display, fontSize: 13, letterSpacing: 0.8, color: C.label2 }}>Order #{o.order_no} · {o.status}</Text><Text style={{ fontFamily: F.display, fontSize: 30, lineHeight: 34, color: C.label }}>{o.dining_tables?.name ? `Table ${o.dining_tables.name}` : o.customer_name ?? o.type}</Text></View>
          <Flip value={live.length} label="items" size={56} />
        </View>
        {o.kots.map((k, ki) => { const its = kotItems(k.id); const ready = its.filter((i) => i.status === "ready").length; return (
          <Inset key={k.id} header={`KOT #${k.kot_no} · ${k.status} · ${mins(k.created_at)} min`} footer={ready ? `${ready} ready to carry out` : undefined}>
            {its.map((i, idx) => <Cell key={i.id} first={idx === 0} leading={<Text style={{ fontFamily: F.display, fontSize: 20, color: C.label }}>{i.qty}</Text>} title={i.name_snapshot} detail={i.notes ?? undefined} trailing={<Pill tone={tone(i.status)} label={i.status} />} chevron={false} />)}
            {ready > 0 && <View style={{ padding: 12 }}><Button title="Mark served" icon={<Check size={16} color={C.onTint} />} onPress={() => serve(k.id)} /></View>}
          </Inset>); })}
      </ScrollView>
      <View style={{ position: "absolute", left: 12, right: 12, bottom: 14, backgroundColor: C.card, borderRadius: 26, borderWidth: 0.5, borderColor: C.line, padding: 12, paddingLeft: 20, flexDirection: "row", alignItems: "center", gap: 12, ...shadow }}>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: F.sans, fontSize: 12, color: C.label2 }}>On the table</Text><Text style={{ fontFamily: F.display, fontSize: 22, color: C.label }}>{formatINR(total)}</Text></View>
        {o.status === "open" && <Button title="Add" variant="gray" icon={<Plus size={16} color={C.label} />} onPress={() => router.push({ pathname: "/order/new", params: { table: o.table_id ?? "" } } as never)} />}
      </View>
    </SafeAreaView>
    </View>
  );
}
