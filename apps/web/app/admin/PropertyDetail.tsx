"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Pill, cn } from "@/components/ui";
import type { PropertyDetail } from "./actions";

const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—"
  : typeof v === "boolean" ? (v ? "yes" : "no")
  : String(v).length === 24 && /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? String(v).slice(0, 16).replace("T", " ")
  : String(v);

/** Every field as one block of text, so it can be pasted into a message or a ticket. */
function asText(d: PropertyDetail) {
  const block = (title: string, rows: [string, unknown][]) =>
    [title, ...rows.map(([k, v]) => `  ${label(k)}: ${show(v)}`)].join("\n");
  return [
    block("PROPERTY", Object.entries(d.property)),
    block("TAX & GST", Object.entries(d.tax)),
    ["USERS", ...d.users.map((u) => [
      `  ${u.name} (${u.role})`,
      `    Login id      : ${u.login_id}`,
      `    Contact email : ${u.contact_email ?? "—"}`,
      `    Password      : ${u.must_change_password ? "temporary, not yet changed" : "set by the user"}`,
      `    Active        : ${u.is_active ? "yes" : "no"}`,
      `    Last sign-in  : ${show(u.last_sign_in_at)}`,
    ].join("\n"))].join("\n"),
    block("CONTENTS", Object.entries(d.contents)),
  ].join("\n\n");
}

function CopyButton({ text, label: l = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="outline" className={className}
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); }}>
      {done ? <><Check size={14} /> Copied</> : <><Copy size={14} /> {l}</>}
    </Button>
  );
}

const Rows = ({ data }: { data: Record<string, unknown> }) => (
  <dl className="text-sm grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1.5">
    {Object.entries(data).map(([k, v]) => (
      <div key={k} className="contents">
        <dt className="text-steel">{label(k)}</dt>
        <dd className={cn("break-all", /gstin|pan|slug|id$|email|phone|rate|pct/.test(k) && "num")}>{show(v)}</dd>
      </div>
    ))}
  </dl>
);

export function PropertyDetailView({ detail }: { detail: PropertyDetail }) {
  const { property, tax, users, contents } = detail;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <p className="text-sm text-steel flex-1">Everything on record for this property. Passwords are not here — they exist only as hashes.</p>
        <CopyButton text={asText(detail)} label="Copy all" />
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-steel flex-1">Property</div>
          <CopyButton text={Object.entries(property).map(([k, v]) => `${label(k)}: ${show(v)}`).join("\n")} />
        </div>
        <div className="feather p-4"><Rows data={property} /></div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-steel flex-1">Users and sign-in</div>
          <CopyButton text={users.map((u) => `${u.name} (${u.role}) — ${u.login_id} — codes to ${u.contact_email ?? "no address"}`).join("\n")} />
        </div>
        {users.length === 0 ? <p className="text-sm text-steel">No login has been created for this property yet.</p> : users.map((u) => (
          <div key={u.login_id} className="feather p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{u.name}</span>
              <Pill tone="gold">{u.role}</Pill>
              {u.must_change_password && <Pill tone="alert">temporary password</Pill>}
              {!u.is_active && <Pill tone="alert">disabled</Pill>}
            </div>
            <dl className="text-sm grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-1">
              <dt className="text-steel">Login id</dt>
              <dd className="num break-all flex items-center gap-2">{u.login_id}<CopyButton text={u.login_id} label="" className="!h-7 !px-2" /></dd>
              <dt className="text-steel">Codes go to</dt>
              <dd className={cn("break-all", u.contact_email ? "num" : "text-[var(--color-orange)]")}>
                {u.contact_email ?? "no address on file — they cannot change their password"}
              </dd>
              <dt className="text-steel">Last sign-in</dt><dd>{show(u.last_sign_in_at)}</dd>
              <dt className="text-steel">Created</dt><dd>{show(u.created_at)}</dd>
            </dl>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-steel">Tax &amp; GST</div>
        <div className="feather p-4"><Rows data={tax} /></div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-steel">What it holds</div>
        <div className="feather p-4">
          <ul className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(contents).map(([k, n]) => (
              <li key={k} className={n > 0 ? "" : "text-steel"}>
                <span className="num font-semibold">{n}</span> {label(k).toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
