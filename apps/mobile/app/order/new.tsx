import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Search, Minus, Plus, Flame } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "@/lib/supabase";
import { enqueue } from "@/lib/queue";
import { Button, Chips, DeckHandle, Flip } from "@/components/ui";
import { C, F, shadow } from "@/lib/theme";
import { formatINR } from "@dineflow/shared";

type Cat = { id: string; name: string }; type Item = { id: string; name: string; price: number; is_veg: boolean; category_id: string | null };
type T = { id: string; name: string; status: string };

export default function NewOrder() {
  const { table } = useLocalSearchParams<{ table?: string }>(); const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]); const [items, setItems] = useState<Item[]>([]); const [tables, setTables] = useState<T[]>([]);
  const [type, setType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in"); const [tableId, setTableId] = useState<string | null>(table ?? null);
  const [cat, setCat] = useState("all"); const [q, setQ] = useState(""); const [cart, setCart] = useState<Record<string, number>>({}); const [name, setName] = useState("");
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { (async () => {
    const [c, i, t] = await Promise.all([supabase.from("categories").select("id, name").order("sort_order"), supabase.from("menu_items").select("id, name, price, is_veg, category_id").eq("is_available", true).order("name"), supabase.from("dining_tables").select("id, name, status").order("sort_order")]);
    setCats(c.data ?? []); setItems((i.data ?? []) as Item[]); setTables(t.data ?? []);
  })(); }, []);
  const visible = useMemo(() => items.filter((i) => (cat === "all" || i.category_id === cat) && i.name.toLowerCase().includes(q.toLowerCase())), [items, cat, q]);
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, qty]) => ({ item: items.find((i) => i.id === id)!, qty }));
  const total = lines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0); const count = lines.reduce((s, l) => s + l.qty, 0);
  const add = (id: string, d: number) => { Haptics.selectionAsync(); setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + d) })); };
  const send = async () => {
    if (type === "dine_in" && !tableId) return setErr("Pick a table");
    setBusy(true); setErr(null);
    const items = lines.map((l) => ({ menu_item_id: l.item.id, qty: l.qty }));
    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      // No signal: keep the order on this phone and send it automatically when the signal returns.
      await enqueue("place_order", { table_id: type === "dine_in" ? tableId : null, type, items, customer: { name: name || null }, note: null, client_id: clientId, placed_at: new Date().toISOString() }, `Order · ${lines.length} items`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)/tables");
      return;
    }
    const { data, error } = await supabase.rpc("place_order", { p_type: type, p_table_id: type === "dine_in" ? tableId : null, p_items: items, p_customer: { name: name || null }, p_note: null, p_client_id: clientId, p_placed_at: new Date().toISOString() });
    setBusy(false);
    if (error) return setErr(error.message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace(`/order/${data}`);
  };
  const input = { height: 44, borderRadius: 14, backgroundColor: C.bg3, color: C.label, paddingHorizontal: 14, fontFamily: F.sans, fontSize: 16 } as const;
  return (
    <View style={{ flex: 1, backgroundColor: C.bezel }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, marginHorizontal: 6, marginTop: 6, borderRadius: 28, overflow: "hidden" }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 }}>
        <DeckHandle />
        <View style={{ flex: 1 }}><Text style={{ fontFamily: F.display, fontSize: 13, letterSpacing: 0.8, color: C.label2 }}>{type === "dine_in" ? (tables.find((t) => t.id === tableId) ? `Table ${tables.find((t) => t.id === tableId)!.name}` : "Pick a table") : type === "takeaway" ? "Takeaway" : "Delivery"}</Text><Text style={{ fontFamily: F.display, fontSize: 30, lineHeight: 34, color: C.label }}>New order</Text></View>
      </View>
      <View style={{ paddingHorizontal: 20, gap: 10, marginBottom: 12 }}>
        <Chips value={type} onChange={(v) => { setType(v); if (v !== "dine_in") setTableId(null); }} options={[{ v: "dine_in", label: "Dine in" }, { v: "takeaway", label: "Takeaway" }, { v: "delivery", label: "Delivery" }]} />
        {type === "dine_in" && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{tables.map((t) => <Pressable key={t.id} onPress={() => { Haptics.selectionAsync(); setTableId(t.id); }} style={{ height: 40, minWidth: 48, paddingHorizontal: 14, borderRadius: 20, backgroundColor: tableId === t.id ? C.label : t.status === "occupied" ? C.fill2 : C.fill, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.display, fontSize: 16, color: tableId === t.id ? C.bg : C.label }}>{t.name}</Text></Pressable>)}</ScrollView>}
        {type !== "dine_in" && <TextInput placeholder="Customer name" value={name} onChangeText={setName} placeholderTextColor={C.label3} style={input} />}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, ...input }}><Search size={16} color={C.label3} /><TextInput placeholder="Find a dish" value={q} onChangeText={setQ} placeholderTextColor={C.label3} style={{ flex: 1, fontFamily: F.sans, fontSize: 16, color: C.label }} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{[{ id: "all", name: "All" }, ...cats].map((c) => <Pressable key={c.id} onPress={() => { Haptics.selectionAsync(); setCat(c.id); }} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: cat === c.id ? C.label : C.fill, justifyContent: "center" }}><Text style={{ fontFamily: F.sansBold, fontWeight: "600", fontSize: 13, color: cat === c.id ? C.bg : C.label }}>{c.name}</Text></Pressable>)}</ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 0.5, borderColor: C.line, overflow: "hidden" }}>
          {visible.map((it, i) => { const n = cart[it.id] ?? 0; return (
            <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingLeft: 16, paddingRight: 10, borderTopWidth: i ? 0.5 : 0, borderTopColor: C.line, backgroundColor: n ? "rgba(76,217,100,0.06)" : "transparent" }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.is_veg ? C.tint : C.red }} />
              <View style={{ flex: 1 }}><Text style={{ fontFamily: F.sans, fontSize: 16, color: C.label }}>{it.name}</Text><Text style={{ fontFamily: F.display, fontSize: 14, color: C.label2 }}>{formatINR(Number(it.price))}</Text></View>
              {n ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Pressable onPress={() => add(it.id, -1)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.fill, alignItems: "center", justifyContent: "center" }}><Minus size={16} color={C.label} /></Pressable><Flip value={n} size={36} /><Pressable onPress={() => add(it.id, 1)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.tint, alignItems: "center", justifyContent: "center" }}><Plus size={16} color={C.onTint} /></Pressable></View>
                 : <Pressable onPress={() => add(it.id, 1)} style={{ height: 36, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "rgba(76,217,100,0.16)", justifyContent: "center" }}><Text style={{ fontFamily: F.sansBold, fontWeight: "700", fontSize: 13, color: C.tint }}>Add</Text></Pressable>}
            </View>); })}
          {visible.length === 0 && <Text style={{ fontFamily: F.sans, color: C.label2, padding: 20, textAlign: "center" }}>Nothing matches.</Text>}
        </View>
      </ScrollView>
      {count > 0 && <View style={{ position: "absolute", left: 12, right: 12, bottom: 14, backgroundColor: C.card, borderRadius: 26, borderWidth: 0.5, borderColor: C.line, padding: 12, paddingLeft: 20, flexDirection: "row", alignItems: "center", gap: 12, ...shadow }}>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: F.sansBold, fontWeight: "700", fontSize: 14, color: C.label }}>{count} item{count > 1 ? "s" : ""}</Text><Text style={{ fontFamily: F.display, fontSize: 22, color: C.label }}>{formatINR(total)}</Text></View>
        {err && <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.red, maxWidth: 110 }}>{err}</Text>}
        <Button title={busy ? "Sending" : "Send to kitchen"} icon={<Flame size={16} color={C.onTint} />} onPress={send} loading={busy} disabled={busy} />
      </View>}
    </SafeAreaView>
    </View>
  );
}
