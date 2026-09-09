import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { Empty } from "@/components/ui";
import { formatINR } from "@/lib/format";
export const metadata = { title: "Guests" };
export const dynamic = "force-dynamic";
export default async function Guests({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams; const s = await createClient();
  let query = s.from("guests").select("*, bookings(id, check_in, check_out, status, rate)").order("created_at", { ascending: false }).limit(100);
  if (q) query = query.ilike("full_name", `%${q}%`);
  const { data: guests } = await query;
  return (
    <>
      <PageHeader eyebrow="Who stays with you" title="Guest" accent="book" actions={<form><input name="q" defaultValue={q} placeholder="Search by name" className="!w-56" /></form>} />
      {!guests?.length ? <Empty title="No guests yet" hint="Guests are created with their first booking at the front desk." /> : (
        <div className="feather overflow-x-auto table-wrap"><table className="w-full text-sm min-w-[640px]"><thead><tr><th className="text-left px-4 py-3">Guest</th><th className="text-left px-4 py-3">Contact</th><th className="text-right px-4 py-3">Stays</th><th className="text-left px-4 py-3">Last stay</th><th className="text-right px-4 py-3">Lifetime room revenue</th></tr></thead>
          <tbody>{guests.map((g) => { const bs = (g.bookings as { check_in: string; check_out: string; status: string; rate: number }[]).filter((b) => b.status !== "cancelled"); const last = bs.sort((a, b) => b.check_in.localeCompare(a.check_in))[0]; const rev = bs.reduce((t, b) => t + Math.max(1, Math.round((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000)) * Number(b.rate), 0);
            return <tr key={g.id} className=""><td className="px-4 py-3"><div className="flex items-center gap-3"><span className="h-9 w-9 rounded-full bg-ink text-champagne grid place-items-center font-display">{g.full_name.slice(0, 1)}</span><div><div className="font-semibold">{g.full_name}</div><div className="text-xs text-steel">{g.id_type} ••••{g.id_last4}</div></div></div></td><td className="px-4 py-3 text-steel">{g.phone}{g.email ? <div className="text-xs">{g.email}</div> : null}</td><td className="px-4 py-3 text-right num">{bs.length}</td><td className="px-4 py-3 num text-steel">{last ? `${last.check_in} → ${last.check_out}` : "—"}</td><td className="px-4 py-3 text-right num font-semibold">{formatINR(rev)}</td></tr>; })}</tbody></table></div>
      )}
    </>
  );
}
