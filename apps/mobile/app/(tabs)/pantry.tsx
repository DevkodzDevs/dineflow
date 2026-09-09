import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Plus, Search } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { cacheGet, cacheSet } from "@/lib/cache";
import { enqueue, onQueue } from "@/lib/queue";
import { Screen, Inset, Cell, Value, Flip, Sheet, Chips, Button, IconButton } from "@/components/ui";
import { C, F } from "@/lib/theme";

type I = { id: string; name: string; unit: string; current_stock: number; reorder_level: number };
const TABS = ["home", "tables", "kitchen", "pulse", "more"];

/**
 * The pantry on a phone: what is short first, then everything, searchable. Tap an ingredient to
 * record a purchase, wastage or an adjustment in a sheet — the keyboard never pushes the list about.
 */
export default function Pantry() {
  const [items, setItems] = useState<I[]>([]); const [q, setQ] = useState(""); const [sel, setSel] = useState<I | null>(null); const [qty, setQty] = useState(""); const [reason, setReason] = useState<"purchase" | "wastage" | "adjustment">("purchase"); const [online, setOnline] = useState(true); const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { void cacheGet<I[]>("pantry").then((c) => { if (c) setItems(c.v); }); const un = onQueue((s) => setOnline(s.online)); return () => { un(); }; }, []);
  const load = async () => { const { data } = await supabase.from("ingredients").select("id, name, unit, current_stock, reorder_level").eq("is_active", true).order("name"); if (data) { setItems(data as I[]); void cacheSet("pantry", data); } };
  useLive(["ingredients"], () => { void load(); });
  const apply = async () => {
    if (!sel || !Number(qty)) return; const n = Number(qty) * (reason === "wastage" ? -1 : 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setSel(null); setQty("");
    setItems((all) => all.map((i) => i.id === sel.id ? { ...i, current_stock: Number(i.current_stock) + n } : i));
    if (!online) { void enqueue("stock", { ingredient_id: sel.id, qty: n, reason, note: "from mobile" }, `Pantry · ${sel.name}`); return; }
    await supabase.from("stock_ledger").insert({ ingredient_id: sel.id, qty: n, reason, note: "from mobile" }); void load();
  };
  const low = items.filter((i) => Number(i.current_stock) <= Number(i.reorder_level));
  const shown = items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  const row = (i: I, first: boolean) => { const isLow = Number(i.current_stock) <= Number(i.reorder_level); return <Cell key={i.id} first={first} title={i.name} detail={`reorder at ${i.reorder_level} ${i.unit}`} trailing={<Value tone={isLow ? "alert" : undefined}>{Number(i.current_stock).toFixed(1)} {i.unit}</Value>} onPress={() => setSel(i)} />; };
  return (
    <Screen tabs={TABS} title="Pantry" subtitle={`${items.length} ingredients`} right={<Flip value={low.length} label="short" size={56} tone={low.length ? "alert" : "live"} />} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <View style={{ marginHorizontal: 20, marginBottom: 16, height: 44, borderRadius: 14, backgroundColor: C.bg3, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}><Search size={16} color={C.label3} /><TextInput value={q} onChangeText={setQ} placeholder="Find an ingredient" placeholderTextColor={C.label3} style={{ flex: 1, fontFamily: F.sans, fontSize: 16, color: C.label }} /></View>
      {!q && low.length > 0 && <Inset header={`Below reorder · ${low.length}`} footer="Tap to record a purchase.">{low.map((i, k) => row(i, k === 0))}</Inset>}
      <Inset header={q ? `Matching "${q}"` : "Everything"}>{shown.length === 0 ? <Cell first title="Nothing matches" chevron={false} /> : shown.map((i, k) => row(i, k === 0))}</Inset>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name ?? ""}>
        {sel && <View style={{ gap: 12 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.label2 }}>On hand {Number(sel.current_stock).toFixed(1)} {sel.unit} · reorder at {sel.reorder_level} {sel.unit}</Text>
          <Chips value={reason} onChange={setReason} options={[{ v: "purchase", label: "Bought" }, { v: "wastage", label: "Wasted" }, { v: "adjustment", label: "Adjust" }]} />
          <TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder={`Quantity in ${sel.unit}`} placeholderTextColor={C.label3} autoFocus style={{ height: 52, borderRadius: 14, backgroundColor: C.bg3, color: C.label, paddingHorizontal: 14, fontFamily: F.display, fontSize: 22 }} />
          <Button title={reason === "purchase" ? "Add to stock" : reason === "wastage" ? "Take off stock" : "Adjust stock"} icon={<Plus size={16} color={C.onTint} />} onPress={apply} disabled={!Number(qty)} />
        </View>}
      </Sheet>
    </Screen>
  );
}
