import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { LabourClient } from "./LabourClient";
export const metadata = { title: "Labour" };
export const dynamic = "force-dynamic";
export default async function LabourPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  const { tab, open } = await searchParams; const s = await createClient(); const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: labourers }, { data: att }, { data: pays }, { data: rooms }, { data: ingredients }, { data: punches }] = await Promise.all([
    requireSession(),
    s.from("labourers").select("*").order("status").order("full_name"),
    s.from("labour_attendance").select("id, labourer_id, work_date, in_at, out_at, hours, wage, method_in, method_out").gte("work_date", monthStart).order("work_date"),
    s.from("labour_payments").select("id, labourer_id, amount, method, period_from, period_to, created_at").gte("created_at", `${monthStart}T00:00:00+05:30`),
    tab === "labels" ? s.from("rooms").select("id, number, floor").order("sort_order") : Promise.resolve({ data: [] }),
    tab === "labels" ? s.from("ingredients").select("id, name, unit, barcode").eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
    s.from("attendance_punches").select("id, labourer_id, at, direction, method, distance_m, photo_path").not("labourer_id", "is", null).gte("at", `${today}T00:00:00+05:30`).order("at", { ascending: false }).limit(60),
  ]);
  // selfies sit in a private bucket; the storage policy lets this property's staff sign their own
  const photos = (punches ?? []).filter((p) => p.photo_path).map((p) => p.photo_path as string);
  const signed = photos.length ? (await s.storage.from("attendance").createSignedUrls(photos, 3600)).data ?? [] : [];
  const url = new Map(signed.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  const log = (punches ?? []).map((p) => ({ ...p, photo: p.photo_path ? url.get(p.photo_path) ?? null : null }));
  const methods = (session.restaurant.attendance_methods as string[] | undefined) ?? ["manual", "qr"];
  return (
    <>
      <PageHeader eyebrow="Daily-wage & contract workers" title="Labour" accent="& attendance" sub="Scan badge to punch" />
      <LabourClient today={today} labourers={(labourers ?? []) as never} attendance={(att ?? []) as never} payments={(pays ?? []) as never} tab={tab === "labels" ? "labels" : tab === "wages" ? "wages" : "today"} openId={open ?? null} rooms={rooms ?? []} ingredients={ingredients ?? []} property={session.restaurant.name} methods={methods} log={log as never} />
    </>
  );
}
