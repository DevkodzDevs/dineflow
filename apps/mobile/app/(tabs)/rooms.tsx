import { useState } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { Check, Sparkles, Wrench } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { enqueue, onQueue } from "@/lib/queue";
import { Screen, Chips, Inset, Cell, Value, Flip, Sheet, Button } from "@/components/ui";
import { C, F, shadow } from "@/lib/theme";
import { useEffect } from "react";

type R = { id: string; number: string; floor: string; status: string; room_types: { name: string } | null };
type B = { id: string; booking_no: number; room_id: string; status: string; check_in: string; check_out: string; guests: { full_name: string } | null; rooms: { number: string } | null };
const TABS = ["home", "tables", "kitchen", "pulse", "more"];

/**
 * The room board on a phone: three key cards across, floors as chips, the state as the card's colour
 * — dark when occupied, amber when being turned, light when ready. Tap a card for its actions in a sheet.
 */
export default function Rooms() {
  const { width } = useWindowDimensions();
  const [rooms, setRooms] = useState<R[]>([]); const [bookings, setBookings] = useState<B[]>([]); const [sel, setSel] = useState<R | null>(null); const [floor, setFloor] = useState("all"); const [online, setOnline] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  useEffect(() => { const un = onQueue((q) => setOnline(q.online)); return () => { un(); }; }, []);
  const load = async () => {
    const [r, b] = await Promise.all([supabase.from("rooms").select("id, number, floor, status, room_types(name)").order("sort_order"), supabase.from("bookings").select("id, booking_no, room_id, status, check_in, check_out, guests(full_name), rooms(number)").in("status", ["reserved", "checked_in"])]);
    setRooms((r.data ?? []) as never); setBookings((b.data ?? []) as never);
  };
  useLive(["rooms", "bookings", "housekeeping_tasks"], () => { void load(); });
  const byRoom = Object.fromEntries(bookings.filter((b) => b.status === "checked_in").map((b) => [b.room_id, b]));
  const arrivals = bookings.filter((b) => b.status === "reserved" && b.check_in <= today);
  const floors = ["all", ...[...new Set(rooms.map((r) => r.floor))].sort()];
  const list = rooms.filter((r) => floor === "all" || r.floor === floor);
  const count = (s: string) => rooms.filter((r) => r.status === s).length;
  const cardW = Math.floor((width - 40 - 24) / 3);
  const look = (s: string) => s === "occupied" ? { bg: C.label, fg: C.bg, sub: C.bg } : s === "cleaning" ? { bg: "rgba(255,179,64,0.16)", fg: C.orange, sub: C.label2 } : s === "maintenance" ? { bg: C.red2, fg: C.red, sub: C.label2 } : { bg: C.card, fg: C.label, sub: C.label2 };
  const act = async (fn: () => PromiseLike<unknown>, offline: () => void, label: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSel(null); if (!online) { offline(); return; } await fn(); void load(); };
  return (
    <Screen tabs={TABS} title="Rooms" subtitle={`${count("occupied")} of ${rooms.length} occupied tonight`} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 20 }}>
        <Flip value={count("occupied")} label="occupied" size={cardW} tone="live" /><Flip value={count("available")} label="ready" size={cardW} /><Flip value={count("cleaning")} label="cleaning" size={cardW} tone={count("cleaning") ? "alert" : undefined} />
      </View>
      {arrivals.length > 0 && <Inset header={`Arriving today · ${arrivals.length}`}>{arrivals.map((b, i) => <Cell key={b.id} first={i === 0} title={b.guests?.full_name ?? "Guest"} detail={`Room ${b.rooms?.number ?? "—"} · until ${b.check_out}`} trailing={<Value tone="muted">#{b.booking_no}</Value>} chevron={false} />)}</Inset>}
      {floors.length > 2 && <View style={{ paddingHorizontal: 20, marginBottom: 14 }}><Chips value={floor} onChange={setFloor} options={floors.map((f) => ({ v: f, label: f === "all" ? "All floors" : `Floor ${f}` }))} /></View>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: 20 }}>
        {list.map((r) => { const k = look(r.status); const b = byRoom[r.id]; return (
          <Pressable key={r.id} onPress={() => { Haptics.selectionAsync(); setSel(r); }} style={({ pressed }) => ({ width: cardW, aspectRatio: 1, borderRadius: 16, padding: 12, backgroundColor: k.bg, borderWidth: 0.5, borderColor: C.line, justifyContent: "space-between", transform: [{ scale: pressed ? 0.96 : 1 }], ...shadow })}>
            <View><Text style={{ fontFamily: F.display, fontSize: 24, color: k.fg }}>{r.number}</Text><Text style={{ fontFamily: F.display, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: k.sub, opacity: 0.8 }}>{r.room_types?.name ?? ""}</Text></View>
            <Text style={{ fontFamily: F.sans, fontSize: 11, color: k.sub }} numberOfLines={2}>{b ? `${b.guests?.full_name?.split(" ")[0] ?? "Guest"} · out ${b.check_out.slice(5)}` : r.status === "cleaning" ? "Being turned" : r.status === "maintenance" ? "Repair" : "Ready"}</Text>
          </Pressable>); })}
      </View>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel ? `Room ${sel.number}` : ""}>
        {sel && <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.label2 }}>{sel.room_types?.name ?? ""} · {sel.status}{byRoom[sel.id] ? ` · ${byRoom[sel.id].guests?.full_name} until ${byRoom[sel.id].check_out}` : ""}</Text>
          {sel.status !== "available" && <Button title="Mark ready" icon={<Check size={16} color={C.onTint} />} onPress={() => act(async () => { await supabase.from("housekeeping_tasks").update({ status: "done" }).eq("room_id", sel.id).neq("status", "done"); await supabase.from("rooms").update({ status: "available" }).eq("id", sel.id); }, () => { void enqueue("table_status", { id: sel.id, status: "available" }, `Room ${sel.number} ready`); }, "ready")} />}
          {sel.status === "available" && <Button title="Send to cleaning" variant="gray" icon={<Sparkles size={16} color={C.label} />} onPress={() => act(async () => { await supabase.from("rooms").update({ status: "cleaning" }).eq("id", sel.id); }, () => { void enqueue("hk_status", { id: sel.id, status: "cleaning" }, `Room ${sel.number} cleaning`); }, "cleaning")} />}
          {sel.status !== "maintenance" && <Button title="Out for repair" variant="danger" icon={<Wrench size={16} color={C.red} />} onPress={() => act(async () => { await supabase.from("rooms").update({ status: "maintenance" }).eq("id", sel.id); }, () => { void enqueue("hk_status", { id: sel.id, status: "maintenance" }, `Room ${sel.number} repair`); }, "repair")} />}
        </View>}
      </Sheet>
    </Screen>
  );
}
