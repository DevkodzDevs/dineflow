import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { financialYear, statutoryCalendar, GST_STATES } from "@dineflow/shared";
export const metadata = { title: "Compliance · Master control" };
export const dynamic = "force-dynamic";

/**
 * Every property's tax standing on one screen: how it is registered, what is overdue, what is
 * about to expire. The master reads the tenants' rows through the platform-admin clause in their
 * policies; the overdue count is computed here from the same statutory calendar the property sees.
 */
export default async function CompliancePage() {
  await requireAdmin(); const s = await createClient(); const today = todayIST(); const fy = financialYear(today);
  const [{ data: props }, { data: filings }, { data: docs }] = await Promise.all([
    s.from("restaurants").select("id, name, property_type, gstin, legal_name, pan, gst_scheme, gst_state_code, gst_monthly, fssai_no, ca_name, ca_phone, is_shadow").order("name"),
    s.from("compliance_filings").select("restaurant_id, form, period, filed_on"),
    s.from("compliance_docs").select("restaurant_id, kind, expires_on"),
  ]);
  const days = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
  const rows = (props ?? []).filter((p) => !p.is_shadow).map((p) => {
    const filed = new Set((filings ?? []).filter((f) => f.restaurant_id === p.id && f.filed_on).map((f) => `${f.form}|${f.period}`));
    const cal = statutoryCalendar({ fy, scheme: p.gst_scheme ?? "regular", stateCode: p.gst_state_code, monthlyGst: p.gst_monthly !== false, hasStaff: false });
    const overdue = cal.filter((c) => !c.optional && !filed.has(`${c.form}|${c.period}`) && c.due < today);
    const next = cal.find((c) => !c.optional && !filed.has(`${c.form}|${c.period}`) && c.due >= today);
    const mine = (docs ?? []).filter((d) => d.restaurant_id === p.id);
    const expiring = mine.filter((d) => d.expires_on && days(today, d.expires_on) <= 60).length;
    const missing = [!p.gstin && p.gst_scheme !== "unregistered" && "GSTIN", !p.pan && "PAN", !p.fssai_no && "FSSAI", !mine.some((d) => d.kind === "gst_reg") && p.gst_scheme !== "unregistered" && "GST certificate"].filter(Boolean) as string[];
    return { ...p, overdue, next, docs: mine.length, expiring, missing, state: p.gst_state_code ? GST_STATES[p.gst_state_code]?.name : null };
  });
  const totals = { overdue: rows.reduce((t, r) => t + r.overdue.length, 0), missing: rows.filter((r) => r.missing.length).length, expiring: rows.reduce((t, r) => t + r.expiring, 0) };
  return (
    <div>
      <div className="eyebrow">Platform</div>
      <h1 className="text-[34px] md:text-[48px] mt-1">Compliance <em>across {rows.length} propert{rows.length === 1 ? "y" : "ies"}</em></h1>
      <p className="text-sm text-[var(--color-label-2)] mt-2 max-w-2xl">FY {fy}. Overdue counts the returns that fell due and were not marked filed by the property; the master cannot file for them, but can see who needs a call.</p>
      <div className="grid sm:grid-cols-3 gap-4 mt-6">
        <div className="card p-5"><div className="text-[11px] uppercase tracking-wide text-[var(--color-label-2)]">Returns overdue</div><div className={`num text-3xl mt-1 ${totals.overdue ? "text-[var(--color-red)]" : ""}`}>{totals.overdue}</div></div>
        <div className="card p-5"><div className="text-[11px] uppercase tracking-wide text-[var(--color-label-2)]">Profiles incomplete</div><div className={`num text-3xl mt-1 ${totals.missing ? "text-[var(--color-orange)]" : ""}`}>{totals.missing}</div></div>
        <div className="card p-5"><div className="text-[11px] uppercase tracking-wide text-[var(--color-label-2)]">Documents expiring in 60 days</div><div className={`num text-3xl mt-1 ${totals.expiring ? "text-[var(--color-orange)]" : ""}`}>{totals.expiring}</div></div>
      </div>
      <div className="card mt-6 overflow-hidden">
        <div className="table-wrap"><table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--color-label-2)] border-b border-[var(--color-separator)]"><tr><th className="text-left px-4 py-3">Property</th><th className="text-left px-4 py-3">Registration</th><th className="text-left px-4 py-3">State</th><th className="text-left px-4 py-3">Overdue</th><th className="text-left px-4 py-3">Next due</th><th className="text-left px-4 py-3">Documents</th><th className="text-left px-4 py-3">CA</th><th className="text-left px-4 py-3">Missing</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--color-separator)]/60 align-top">
              <td className="px-4 py-3"><div className="font-semibold">{r.name}</div><div className="text-xs text-[var(--color-label-2)] capitalize">{r.property_type}{r.legal_name && r.legal_name !== r.name && ` · ${r.legal_name}`}</div></td>
              <td className="px-4 py-3"><div className="capitalize">{r.gst_scheme ?? "regular"}{r.gst_scheme === "regular" && (r.gst_monthly === false ? " · quarterly" : " · monthly")}</div><div className="num text-xs text-[var(--color-label-2)]">{r.gstin ?? "no GSTIN"}</div></td>
              <td className="px-4 py-3">{r.state ?? <span className="text-[var(--color-label-3)]">—</span>}</td>
              <td className="px-4 py-3">{r.overdue.length ? <span className="pill pill-alert">{r.overdue.length}</span> : <span className="pill pill-ready">none</span>}{r.overdue.length > 0 && <div className="text-xs text-[var(--color-label-2)] mt-1">{r.overdue.slice(0, 2).map((c) => `${c.form} ${c.period}`).join(", ")}{r.overdue.length > 2 && " …"}</div>}</td>
              <td className="px-4 py-3">{r.next ? <><div className="num">{r.next.due}</div><div className="text-xs text-[var(--color-label-2)]">{r.next.form} · {r.next.period}</div></> : <span className="text-[var(--color-label-3)]">—</span>}</td>
              <td className="px-4 py-3"><span className="num">{r.docs}</span>{r.expiring > 0 && <div className="text-xs text-[var(--color-orange)]">{r.expiring} expiring</div>}</td>
              <td className="px-4 py-3">{r.ca_name ? <><div>{r.ca_name}</div>{r.ca_phone && <div className="num text-xs text-[var(--color-label-2)]">{r.ca_phone}</div>}</> : <span className="text-[var(--color-label-3)]">—</span>}</td>
              <td className="px-4 py-3 text-xs">{r.missing.length ? <span className="text-[var(--color-orange)]">{r.missing.join(", ")}</span> : <span className="text-[var(--color-green)]">complete</span>}</td>
            </tr>))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--color-label-2)]">No properties yet.</td></tr>}
          </tbody></table></div>
      </div>
      <p className="footnote mt-4">Each property manages its own filings and documents under <Link href="/admin" className="underline">its Tax &amp; GST screen</Link>; open the property to see the detail.</p>
    </div>
  );
}
