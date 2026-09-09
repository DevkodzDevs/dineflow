import { useState, useEffect } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Bell, Armchair, X, UserPlus } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useLive } from "@/lib/live";
import { enqueue, onQueue } from "@/lib/queue";
import { cacheGet, cacheSet } from "@/lib/cache";
import { Screen, Inset, Cell, Value, Flip, Chips, Sheet, Button, IconButton, Countdown } from "@/components/ui";
import { C, F } from "@/lib/theme";

type T = { id: string; name: string; capacity: number; stage: string; mins_left: number; free_at: string };
type W = { id: string; name: string; party: number; quoted_min: number | null; status: "waiting" | "called"; joined_at: string };
type P = { tables: T[]; free_now: number; next_free_min: number | null };
const TABS = ["home", "tables", "kitchen", "pulse", "more"];

/**
 * Pulse on a phone. The three numbers at the door fill the width; the queue is an inset list where
 * every party is one row and the actions live in a sheet, so the list stays calm and the buttons are
 * big when you need them. Adding a party is a sheet too — a keyboard should never push the list about.
 */
export default function Pulse() {
  const [pulse, setPulse] = useState<P>({ tables: [], free_now: 0, next_free_min: null }); const [queue, setQueue] = useState<W[]>([]);
  const [party, setParty] = useState(2); const [quote, setQuote] = useState<number | null>(null); const [online, setOnline] = useState(true);
  const [add, setAdd] = useState(false); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [act, setAct] = useState<W | null>(null); const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { void cacheGet<{ p: P; q: W[] }>("pulse").then((c) => { if (c) { setPulse(c.v.p); setQueue(c.v.q); } }); const un = onQueue((q) => setOnline(q.online)); return () => { un(); }; }, []);
  const load = async () => {
    const [{ data: p }, { data: q }, { data: m }] = await Promise.all([supabase.rpc("table_pulse"), supabase.from("walkins").select("id, name, party, quoted_min, status, joined_at").in("status", ["waiting", "called"]).order("joined_at"), supabase.rpc("quote_wait", { p_party: party })]);
    if (p) setPulse(p as P); setQueue((q ?? []) as W[]); setQuote(m as number | null); void cacheSet("pulse", { p, q });
  };
  useLive(["orders", "order_items", "bills", "dining_tables", "walkins"], () => { void load(); });
  const mins = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const set = async (w: W, status: "called" | "seated" | "left", table?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setAct(null);
    setQueue((q) => status === "called" ? q.map((x) => x.id === w.id ? { ...x, status: "called" } : x) : q.filter((x) => x.id !== w.id));
    if (!online) { void enqueue("walkin_set", { id: w.id, status, table }, `Queue · ${w.name} ${status}`); return; }
    await supabase.rpc("walkin_set", { p_id: w.id, p_status: status, p_table: table ?? null }); void load();
  };
  const submit = async () => {
    if (!name.trim()) return; Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setAdd(false);
    if (!online) { void enqueue("walkin_add", { name, phone, party }, `Queue · ${name}`); setName(""); setPhone(""); return; }
    await supabase.rpc("walkin_add", { p_name: name, p_phone: phone, p_party: party }); setName(""); setPhone(""); void load();
  };
  const free = pulse.tables.filter((t) => t.stage === "free");
  const input = { height: 48, borderRadius: 14, backgroundColor: C.bg3, color: C.label, paddingHorizontal: 14, fontFamily: F.sans, fontSize: 16 } as const;
  return (
    <Screen tabs={TABS} title="Pulse" subtitle="Honest wait times" right={<IconButton label="Add a party" icon={<UserPlus size={20} color={C.label} />} onPress={() => setAdd(true)} />}
      refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 20 }}>
        <Flip value={queue.length} label="waiting" size={100} tone={queue.length ? "alert" : undefined} />
        <Flip value={pulse.next_free_min ?? 0} label="next free · min" size={100} tone={pulse.free_now ? "live" : undefined} />
        {quote == null ? <Flip value="—" label={`for ${party}`} size={100} /> : <View style={{ height: 100, justifyContent: "center" }}><Countdown seconds={quote * 60} label={`for ${party}`} size={44} /></View>}
      </View>
      <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
        <Chips value={party} onChange={(n) => { setParty(n); supabase.rpc("quote_wait", { p_party: n }).then(({ data }) => setQuote(data as number | null)); }} options={[1, 2, 3, 4, 5, 6, 8].map((n) => ({ v: n, label: String(n) }))} />
      </View>
      <Inset header={queue.length ? `Queue · ${queue.length}` : "Queue"} footer={queue.length ? "Tap a party to call, seat, or take them off." : "Nobody waiting. Tap + to add a party."}>
        {queue.map((w, i) => <Cell key={w.id} first={i === 0} leading={<Flip value={i + 1} size={36} />} title={`${w.name} · ${w.party}`} detail={`${mins(w.joined_at)} min waiting${w.quoted_min != null ? ` · quoted ${w.quoted_min}` : ""}${w.status === "called" ? " · called" : ""}`} onPress={() => setAct(w)} trailing={w.status === "called" ? <Value tone="live">called</Value> : undefined} />)}
      </Inset>
      <Inset header="Tables · when they free up">
        {pulse.tables.map((t, i) => <Cell key={t.id} first={i === 0} leading={<Text style={{ fontFamily: F.display, fontSize: 20, color: C.label }}>{t.name}</Text>} title={`${t.capacity} seats`} detail={t.stage === "free" ? "" : t.stage} trailing={t.stage === "free" ? <Value tone="live">free now</Value> : <Value>{t.mins_left} min</Value>} chevron={false} />)}
      </Inset>

      <Sheet open={add} onClose={() => setAdd(false)} title="Add a party">
        <View style={{ gap: 12 }}>
          <TextInput value={name} onChangeText={setName} placeholder="Guest name" placeholderTextColor={C.label3} style={input} autoFocus />
          <TextInput value={phone} onChangeText={setPhone} placeholder="Phone (optional)" placeholderTextColor={C.label3} keyboardType="phone-pad" style={input} />
          <Chips value={party} onChange={setParty} options={[1, 2, 3, 4, 5, 6, 8].map((n) => ({ v: n, label: String(n) }))} />
          <Button title={quote != null ? `Add · about ${quote} min` : "Add to queue"} icon={<UserPlus size={16} color={C.onTint} />} onPress={submit} disabled={!name.trim()} />
        </View>
      </Sheet>
      <Sheet open={!!act} onClose={() => setAct(null)} title={act ? `${act.name} · party of ${act.party}` : ""}>
        {act && <View style={{ gap: 10 }}>
          {act.status === "waiting" && <Button title="Call them" variant="gray" icon={<Bell size={16} color={C.label} />} onPress={() => set(act, "called")} />}
          <Text style={{ fontFamily: F.display, fontSize: 13, letterSpacing: 0.8, color: C.label2, marginTop: 6 }}>Seat at</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {free.filter((t) => t.capacity >= act.party).map((t) => <Pressable key={t.id} onPress={() => set(act, "seated", t.id)} style={{ height: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: C.tint, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}><Armchair size={16} color={C.onTint} /><Text style={{ fontFamily: F.sansBold, fontWeight: "700", color: C.onTint }}>{t.name} · {t.capacity}</Text></Pressable>)}
            {free.filter((t) => t.capacity >= act.party).length === 0 && <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.label2 }}>No free table big enough yet.</Text>}
          </View>
          <Button title="They left" variant="danger" icon={<X size={16} color={C.red} />} onPress={() => set(act, "left")} style={{ marginTop: 8 }} />
        </View>}
      </Sheet>
    </Screen>
  );
}
