import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Image } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { ScanLine, Camera, Image as ImageIcon, Check, X } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button, Body, Mono, Card, Pill, Screen } from "@/components/ui";
import { C, F, shadow } from "@/lib/theme";
import { QUICK_QTY, formatINR, type ScanResult } from "@dineflow/shared";

type Found = { kind: "ingredient"; row: { id: string; name: string; unit: string; current_stock: number; pack_qty: number | null } } | { kind: "room"; row: { id: string; number: string; status: string } } | { kind: "labour"; row: { id: string; code: string; full_name: string } } | { kind: "dish"; row: { id: string; name: string; price: number } } | { kind: "unknown"; code: string };
const WEB = process.env.EXPO_PUBLIC_WEB_URL;

const TABS = ["home", "tables", "kitchen", "pulse", "more"];
export default function Scan() {
  const { session } = useAuth(); const router = useRouter();
  const [perm, requestPerm] = useCameraPermissions();
  const [live, setLive] = useState(false); const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null); const [ai, setAi] = useState<ScanResult | null>(null); const [photo, setPhoto] = useState<string | null>(null);
  const [qty, setQty] = useState(0); const [reason, setReason] = useState<"purchase" | "wastage">("purchase"); const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [manual, setManual] = useState("");
  const [camRef, setCamRef] = useState<CameraView | null>(null);
  useEffect(() => { if (!perm?.granted) requestPerm(); }, [perm]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setFound(null); setAi(null); setPhoto(null); setErr(null); setMsg(null); setQty(0); setLive(false); };
  const lookup = async (code: string) => {
    setBusy("Looking up…"); setLive(false); Haptics.selectionAsync();
    const own = /^df:(room|ing|dish|lab):(.+)$/.exec(code.trim());
    let f: Found = { kind: "unknown", code };
    if (own?.[1] === "room") { const { data } = await supabase.from("rooms").select("id, number, status").eq("id", own[2]).maybeSingle(); if (data) f = { kind: "room", row: data }; }
    else if (own?.[1] === "ing") { const { data } = await supabase.from("ingredients").select("id, name, unit, current_stock, pack_qty").eq("id", own[2]).maybeSingle(); if (data) f = { kind: "ingredient", row: data as never }; }
    else if (own?.[1] === "dish") { const { data } = await supabase.from("menu_items").select("id, name, price").eq("id", own[2]).maybeSingle(); if (data) f = { kind: "dish", row: data as never }; }
    else if (own?.[1] === "lab") { const { data } = await supabase.from("labourers").select("id, code, full_name").eq("code", own[2].toUpperCase()).maybeSingle(); if (data) f = { kind: "labour", row: data }; }
    else {
      const { data: ing } = await supabase.from("ingredients").select("id, name, unit, current_stock, pack_qty").eq("barcode", code).maybeSingle();
      if (ing) f = { kind: "ingredient", row: ing as never };
      else { const { data: lab } = await supabase.from("labourers").select("id, code, full_name").eq("code", code.toUpperCase()).maybeSingle(); if (lab) f = { kind: "labour", row: lab }; else { const { data: room } = await supabase.from("rooms").select("id, number, status").eq("number", code).maybeSingle(); if (room) f = { kind: "room", row: room }; } }
    }
    setFound(f); setBusy(null);
    if (f.kind === "labour") { const { data, error } = await supabase.rpc("labour_punch", { p_code: f.row.code }); if (!error) { const d = data as { event: string; hours?: number }; setMsg(`${f.row.full_name} punched ${d.event === "in" ? "IN" : d.event === "out" ? `OUT · ${d.hours} h` : "(done today)"}`); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } }
    if (f.kind === "ingredient" && f.row.pack_qty) setQty(Number(f.row.pack_qty));
    if (f.kind === "unknown") { setAi({ kind: "ingredient", name: "", confidence: 0, unit: "kg", barcode: code }); setName(""); }
  };
  const recognise = async (base64: string, mime: string) => {
    if (!WEB) { setErr("Set EXPO_PUBLIC_WEB_URL in apps/mobile/.env to enable photo recognition."); return; }
    setBusy("Recognising…"); setLive(false); setErr(null);
    try {
      const r = await fetch(`${WEB}/api/scan`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ image: `data:${mime};base64,${base64}`, hint: "auto" }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setAi(j); setName(j.name ?? ""); setQty(j.estimated_qty ?? 0); setPrice(String(j.price_estimate_inr ?? "")); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const snap = async () => { if (!camRef) return; const p = await camRef.takePictureAsync({ base64: true, quality: 0.6 }); if (p?.base64) { setPhoto(p.uri); await recognise(p.base64, "image/jpeg"); } };
  const pick = async () => { const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 }); const a = r.assets?.[0]; if (a?.base64) { setPhoto(a.uri); await recognise(a.base64, a.mimeType ?? "image/jpeg"); } };
  const addStock = async () => { if (found?.kind !== "ingredient" || !qty) return; const { error } = await supabase.from("stock_ledger").insert({ ingredient_id: found.row.id, qty: reason === "wastage" ? -qty : qty, reason, note: "from mobile scan" }); if (error) setErr(error.message); else { setMsg(`${found.row.name}: ${reason === "wastage" ? "−" : "+"}${qty} ${found.row.unit}`); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setFound(null); } };
  const createProduct = async () => { if (!ai || !name) return; const { data, error } = await supabase.from("ingredients").insert({ name, unit: ai.unit ?? "kg", category: ai.category ?? null, brand: ai.brand ?? null, barcode: ai.barcode || null, cost_per_unit: Number(price) || 0 }).select("id").single(); if (error) return setErr(error.message); if (qty) await supabase.from("stock_ledger").insert({ ingredient_id: data.id, qty, reason: "purchase", note: "from mobile scan" }); setMsg(`${name} created in Pantry${qty ? ` · +${qty} ${ai.unit}` : ""}`); setAi(null); };
  const createLabour = async () => { if (!ai || !name) return; const { data: code } = await supabase.rpc("next_labour_code"); const { error } = await supabase.from("labourers").insert({ code, full_name: name, phone: ai.labour?.phone ?? null, skill: ai.labour?.skill ?? null, id_type: ai.labour?.id_type ?? null, id_last4: ai.labour?.id_last4 ?? null, address: ai.labour?.address ?? null, daily_wage: Number(price) || 0 }); if (error) return setErr(error.message); setMsg(`${name} added to Labour · badge ${code}`); setAi(null); };
  const createDish = async () => { if (!ai || !name) return; const { error } = await supabase.from("menu_items").insert({ name, price: Number(price) || 0, is_veg: ai.is_veg ?? true, description: ai.description ?? null }); if (error) return setErr(error.message); setMsg(`${name} added to Menu`); setAi(null); };
  const roomStatus = async (id: string, status: string) => { await supabase.from("rooms").update({ status }).eq("id", id).neq("status", "occupied"); if (status !== "available") await supabase.from("housekeeping_tasks").insert({ room_id: id, kind: status === "cleaning" ? "clean" : "maintenance" }); else await supabase.from("housekeeping_tasks").update({ status: "done" }).eq("room_id", id).neq("status", "done"); setMsg(`Room updated · ${status}`); setFound(null); };
  const quick = QUICK_QTY[(found?.kind === "ingredient" ? found.row.unit : ai?.unit) ?? "kg"] ?? QUICK_QTY.pcs;
  const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => <Pressable onPress={onPress} style={{ height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? C.ink : C.line, backgroundColor: on ? C.ink : C.card, justifyContent: "center" }}><Text style={{ fontFamily: F.sansBold, fontSize: 12, color: on ? "#fff" : C.ink }}>{label}</Text></Pressable>;

  return (
    <Screen tabs={TABS} title="Scan" subtitle="Point at anything">
      <View style={{ paddingHorizontal: 20, gap: 12 }}>
        <View style={{ borderRadius: 22, overflow: "hidden", backgroundColor: C.ink, aspectRatio: 4 / 3, ...shadow }}>
          {live && perm?.granted ? <CameraView ref={setCamRef} style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39"] }} onBarcodeScanned={({ data }) => lookup(data)}>
              <View style={{ position: "absolute", left: "12%", right: "12%", top: "18%", bottom: "18%", borderWidth: 2, borderColor: C.saffron, borderRadius: 18 }} />
              <Text style={{ position: "absolute", bottom: 10, alignSelf: "center", color: "#fff", fontFamily: F.sans, fontSize: 11 }}>Barcodes & QR read automatically · tap Capture for a photo</Text></CameraView>
            : photo ? <Image source={{ uri: photo }} style={{ flex: 1 }} resizeMode="contain" />
            : <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}><ScanLine size={40} color={C.saffron} /><Text style={{ fontFamily: F.display, fontSize: 22, color: "#fff" }}>Ready to scan</Text><Text style={{ color: "#ffffff99", fontFamily: F.sans, fontSize: 12 }}>Barcode, QR label, or a photo of the thing</Text></View>}
          {busy && <View style={{ position: "absolute", inset: 0, backgroundColor: "#10201a99", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontFamily: F.sansBold }}>{busy}</Text></View>}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>{!live ? <Button title="Open camera" icon={<Camera size={16} color={C.ink} />} style={{ flex: 1 }} onPress={() => { reset(); setLive(true); }} /> : <><Button title="Capture" icon={<Camera size={16} color={C.ink} />} style={{ flex: 1 }} onPress={snap} /><Button title="Close" variant="outline" onPress={() => setLive(false)} /></>}<Button title="Gallery" variant="outline" icon={<ImageIcon size={16} color={C.ink} />} onPress={pick} /></View>
        <View style={{ flexDirection: "row", gap: 8 }}><TextInput placeholder="Type code / room no." value={manual} onChangeText={setManual} placeholderTextColor={C.steel} style={{ flex: 1, height: 44, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, fontFamily: F.mono, color: C.ink }} /><Button title="Go" variant="outline" onPress={() => manual && lookup(manual)} /></View>
        {err && <Body style={{ color: C.chili }}>{err}</Body>}
        {msg && <Card style={{ borderColor: C.mint }}><View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Check size={16} color={C.mint} /><Body bold>{msg}</Body></View></Card>}

        {found?.kind === "ingredient" && <Card><Pill tone="ready" label="product" /><Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, marginTop: 6 }}>{found.row.name}</Text><Body muted>in stock <Mono>{Number(found.row.current_stock).toFixed(2)} {found.row.unit}</Mono></Body>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}><Chip label="Add stock" on={reason === "purchase"} onPress={() => setReason("purchase")} /><Chip label="Wastage" on={reason === "wastage"} onPress={() => setReason("wastage")} /></View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>{found.row.pack_qty ? <Chip label={`1 pack · ${found.row.pack_qty} ${found.row.unit}`} on={qty === Number(found.row.pack_qty)} onPress={() => setQty(Number(found.row.pack_qty))} /> : null}{quick.map((q) => <Chip key={q.label} label={q.label} on={qty === q.qty} onPress={() => setQty(q.qty)} />)}</View>
          <TextInput keyboardType="decimal-pad" placeholder={`custom ${found.row.unit}`} value={qty ? String(qty) : ""} onChangeText={(v) => setQty(Number(v))} placeholderTextColor={C.steel} style={{ marginTop: 8, height: 42, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, fontFamily: F.mono, color: C.ink }} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}><Button title={reason === "wastage" ? "Record wastage" : "Add to storage"} style={{ flex: 1 }} onPress={addStock} disabled={!qty} /><Button title="Next" variant="outline" onPress={reset} /></View></Card>}
        {found?.kind === "room" && <Card><Pill tone="pending" label="room" /><Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, marginTop: 6 }}>Room {found.row.number}</Text><Body muted style={{ textTransform: "capitalize" }}>{found.row.status}</Body>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>{found.row.status !== "occupied" && found.row.status !== "available" && <Button title="Mark ready" style={{ flex: 1 }} onPress={() => roomStatus(found.row.id, "available")} />}{found.row.status === "available" && <Button title="Needs cleaning" variant="outline" style={{ flex: 1 }} onPress={() => roomStatus(found.row.id, "cleaning")} />}<Button title="Rooms" variant="outline" onPress={() => router.push("/(tabs)/rooms")} /></View></Card>}
        {found?.kind === "labour" && <Card><Pill tone="preparing" label={`labour · ${found.row.code}`} /><Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, marginTop: 6 }}>{found.row.full_name}</Text><Body muted>Attendance punched. Details are on the web Labour page.</Body><Button title="Scan next" variant="outline" style={{ marginTop: 10 }} onPress={reset} /></Card>}
        {found?.kind === "dish" && <Card><Pill tone="preparing" label="dish" /><Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, marginTop: 6 }}>{found.row.name}</Text><Mono>{formatINR(Number(found.row.price))}</Mono><Button title="Order it" style={{ marginTop: 10 }} onPress={() => router.push("/order/new")} /></Card>}

        {ai && (found?.kind === "unknown" || !found) && <Card>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>{(["ingredient", "dish", "labour"] as const).map((k) => <Chip key={k} label={k === "ingredient" ? "Product" : k === "dish" ? "Dish" : "Labour"} on={ai.kind === k || (k === "ingredient" && ai.kind === "product")} onPress={() => setAi({ ...ai, kind: k })} />)}{ai.confidence > 0 && <Mono style={{ marginLeft: "auto", fontSize: 12, color: C.steel }}>{Math.round(ai.confidence * 100)}%</Mono>}</View>
          {ai.notes ? <Body muted style={{ fontSize: 12, marginTop: 6 }}>{ai.notes}</Body> : null}
          <TextInput placeholder={ai.kind === "labour" ? "Full name" : "Name"} value={name} onChangeText={setName} placeholderTextColor={C.steel} style={{ marginTop: 10, height: 44, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, fontFamily: F.sans, color: C.ink }} />
          <TextInput keyboardType="decimal-pad" placeholder={ai.kind === "labour" ? "Daily wage ₹" : ai.kind === "dish" ? "Price ₹" : `Cost per ${ai.unit ?? "kg"} ₹`} value={price} onChangeText={setPrice} placeholderTextColor={C.steel} style={{ marginTop: 8, height: 44, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, fontFamily: F.mono, color: C.ink }} />
          {(ai.kind === "ingredient" || ai.kind === "product" || ai.kind === "unknown") && <><Body muted style={{ marginTop: 10, fontSize: 12 }}>Quantity in hand · {ai.unit ?? "kg"}</Body><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>{quick.map((q) => <Chip key={q.label} label={q.label} on={qty === q.qty} onPress={() => setQty(q.qty)} />)}</View></>}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}><Button title={ai.kind === "labour" ? "Add labourer" : ai.kind === "dish" ? "Add to menu" : "Create product"} style={{ flex: 1 }} onPress={ai.kind === "labour" ? createLabour : ai.kind === "dish" ? createDish : createProduct} disabled={!name} /><Button title="Discard" variant="outline" icon={<X size={14} color={C.ink} />} onPress={reset} /></View></Card>}
      </View>
    </Screen>
  );
}
