"use client";
import { useState, useTransition } from "react";
import { MessageCircle, Send, Copy, Check, ListChecks, FileText, AlertTriangle, Loader2 } from "lucide-react";
import { Button, Field, Switch, cn } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { copyText } from "@/lib/clipboard";
import { WA_LANGS, WA_TEMPLATE_LIST, type WaLang } from "@/lib/whatsapp-templates";
import { saveWhatsApp, sendWaTest } from "./actions";

/**
 * Settings → WhatsApp (0177): the property's own Meta WhatsApp Business Cloud API number. The owner pastes the phone
 * number id and a permanent token (write-only — the page only ever learns `has_token`), picks the template language,
 * switches each event, sends a test, copies the template texts into Meta, and reads the last 50 messages with their
 * state. Beside Payments because it is the same shape of thing: the property's own keys, never DineFlow's.
 */
export type WaSettings = {
  phone_number_id: string; has_token: boolean; lang: WaLang;
  on_reservation: boolean; on_booking: boolean; on_bill: boolean; on_day_close: boolean; on_alert: boolean; on_shift_reminder: boolean;
  on_table_ready?: boolean; on_order?: boolean;
  alert_discount_over: number; updated_at: string;
};
export type WaRow = { id: string; to: string; kind: string; template: string; status: string; error: string | null; attempts: number; created_at: string; sent_at: string | null; delivered_at: string | null };
export type WaProps = {
  settings: WaSettings | null; log: WaRow[];
  /** the 0177 functions answered — false until the migration is applied */
  available: boolean;
  /** CRON_SECRET is set on this server (the daily sweeper can run; messages themselves go out right after they are queued) */
  cron: boolean;
  /** SUPABASE_SERVICE_ROLE_KEY is set on this server (a test can be sent at once) */
  serviceRole: boolean;
  /** the public address the webhook lives under */
  base: string;
  /** the owner's number for the test — Tomorrow's brief number, else the property's */
  defaultPhone: string;
};

const EVENTS: { key: keyof WaSettings & `on_${string}`; title: string; hint: string }[] = [
  { key: "on_reservation", title: "Table reservation confirmed", hint: "To the guest" },
  { key: "on_booking", title: "Room booked at the desk", hint: "To the guest" },
  { key: "on_bill", title: "Bill paid", hint: "The e-bill link, to the customer's number" },
  { key: "on_day_close", title: "Day close", hint: "Sales, cash, voids — to your brief number" },
  { key: "on_alert", title: "Voids and big discounts", hint: "To your brief number" },
  { key: "on_table_ready", title: "Table ready (waiting list)", hint: "To a guest who ticked WhatsApp on the queue page, when you call them" },
  { key: "on_order", title: "Online order updates", hint: "Accepted, ready, out for delivery — to the guest who ordered on your page" },
  { key: "on_shift_reminder", title: "Shift reminders", hint: "Template ready; nothing sends it yet" },
];
const KIND_LABEL: Record<string, string> = { reservation: "Reservation", booking: "Booking", bill: "E-bill", day_close: "Day close", alert: "Alert", shift_reminder: "Shift reminder", table_ready: "Table ready", test: "Test" };
const STATUS_CLASS: Record<string, string> = {
  queued: "bg-[var(--color-fill)] text-[var(--color-label-2)]",
  sent: "bg-[var(--color-sky-2)] text-[var(--color-sky)]",
  delivered: "bg-[var(--color-green-2)] text-[var(--color-green)]",
  read: "bg-[var(--color-green-2)] text-[var(--color-green)]",
  failed: "bg-[var(--color-red-2)] text-[var(--color-red)]",
};

function Section({ icon, title, children, description }: { icon: React.ReactNode; title: string; children: React.ReactNode; description?: string }) {
  return (
    <div className="settings-section space-y-4">
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel">{icon}</span>
        <div className="min-w-0 pt-1"><h3 className="text-base font-semibold">{title}</h3>{description && <p className="text-xs text-steel mt-0.5">{description}</p>}</div>
      </div>
      {children}
    </div>
  );
}

function CopyKey({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={label} onClick={() => copyText(text).then((ok) => { if (ok) { setDone(true); setTimeout(() => setDone(false), 1500); } })}
      className="min-h-11 min-w-11 px-3 rounded-xl bg-[var(--color-fill)] text-[var(--color-label-2)] hover:text-[var(--color-label)] inline-flex items-center justify-center gap-1.5 text-xs font-semibold shrink-0">
      {done ? <Check size={14} /> : <Copy size={14} />}{done ? "Copied" : "Copy"}
    </button>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const maskPhone = (d: string) => (d.length > 6 ? `${d.slice(0, d.length - 10)} ${d.slice(-10, -5)} ${d.slice(-5)}`.trim() : d);

export function WhatsAppSettings({ settings, log, available, cron, serviceRole, base, defaultPhone }: WaProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [lang, setLang] = useState<WaLang>(settings?.lang ?? "en");
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(EVENTS.map((e) => [e.key, settings ? (settings[e.key] ?? e.key !== "on_shift_reminder") : e.key !== "on_shift_reminder"])));
  const [testPhone, setTestPhone] = useState(defaultPhone);
  const [showTexts, setShowTexts] = useState(false);
  const ready = !!settings?.phone_number_id && !!settings?.has_token;
  const webhook = `${base}/api/webhooks/whatsapp`;

  return (
    <div className="card p-5 sm:p-6 space-y-7" data-wa-card>
      {!available && (
        <div className="rounded-xl bg-[var(--color-orange-2)] text-[var(--color-orange)] px-4 py-3 text-sm flex items-start gap-2" data-wa-unavailable>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> The WhatsApp functions are not on this database yet — apply migration 0177, then reload.
        </div>
      )}
      {msg && (
        <div className={cn("rounded-xl px-4 py-2.5 text-sm", /error|fail|refused|not |cannot|only/i.test(msg) ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-green-2)] text-[var(--color-green)]")} data-wa-msg>{msg}</div>
      )}

      <Section icon={<MessageCircle size={16} />} title="Your WhatsApp number" description={ready ? "Connected · messages go from your number" : "Meta Business → WhatsApp → API setup"}>
        <form className="space-y-4" data-wa-form action={(fd) => start(async () => { const r = await saveWhatsApp(fd); setMsg("error" in r ? r.error! : r.removed ? "WhatsApp removed." : "Saved."); })}>
          <div className="rounded-xl bg-[var(--color-fill)] p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Phone number ID" hint="Digits, under the number in WhatsApp Manager"><input name="phone_number_id" defaultValue={settings?.phone_number_id ?? ""} inputMode="numeric" placeholder="1066…" className="num" autoCapitalize="none" /></Field>
              <Field label="Access token" hint={settings?.has_token ? "Saved. Blank keeps it; 'clear' removes." : "A permanent system-user token"}>
                <PasswordInput name="access_token" autoComplete="new-password" placeholder={settings?.has_token ? "••••••••" : "EAAG…"} />
              </Field>
            </div>
            <Field label="Template language" hint="Create the templates in this language in Meta">
              <select name="lang" value={lang} onChange={(e) => setLang(e.target.value as WaLang)} className="min-h-11">
                {WA_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </Field>
            <div className="space-y-1.5">
              <label>Webhook address</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-xs rounded-xl bg-[var(--color-bg)] px-3 py-3" data-link-field="wa-webhook">{webhook}</code>
                <CopyKey text={webhook} label="Copy the webhook address" />
              </div>
              <p className="footnote">Meta app → WhatsApp → Configuration. Field: messages. The verify token and the app secret are set on the server (WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET).</p>
            </div>
          </div>

          <div className="space-y-2" data-wa-events>
            <div className="text-xs font-semibold uppercase tracking-wide text-steel">What is sent</div>
            {EVENTS.map((e) => (
              <label key={e.key} className="card p-3.5 flex items-center gap-3 cursor-pointer min-h-[64px]">
                <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold">{e.title}</span><span className="block text-xs text-[var(--color-label-2)] mt-0.5">{e.hint}</span></span>
                <Switch on={on[e.key]} onChange={(v) => setOn((o) => ({ ...o, [e.key]: v }))} name={e.title} />
                <input type="checkbox" name={e.key} checked={on[e.key]} readOnly hidden style={{ display: "none" }} />
              </label>
            ))}
            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              <Field label="Alert when a discount is over (₹)" hint="A void always alerts"><input name="alert_discount_over" type="number" min={0} step="50" className="num" defaultValue={Number(settings?.alert_discount_over ?? 500)} /></Field>
            </div>
          </div>

          <Button className="w-full sm:w-auto" disabled={pending || !available}>Save WhatsApp settings</Button>
        </form>
      </Section>

      <Section icon={<Send size={16} />} title="Send me a test" description={ready ? "A test template to your own number" : "Save the number and token first"}>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end" data-wa-test>
          <div className="flex-1"><Field label="Your WhatsApp number"><input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} inputMode="tel" placeholder="98400 12345" className="num" /></Field></div>
          <Button variant="gray" className="w-full sm:w-auto" disabled={pending || !ready || !available}
            onClick={() => start(async () => { const r = await sendWaTest(testPhone); setMsg("error" in r ? r.error! : r.note); })}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send test
          </Button>
        </div>
        {!serviceRole && <p className="footnote">This server cannot send at once (no service-role key); the cloud's nightly sweeper does.</p>}
        {!cron && <p className="footnote text-[var(--color-orange)]">CRON_SECRET is not set on this server — on the cloud it must be, or nothing is ever sent.</p>}
      </Section>

      <Section icon={<FileText size={16} />} title="Template texts" description="Create these in Meta, word for word">
        <button type="button" onClick={() => setShowTexts((v) => !v)} className="min-h-11 px-4 rounded-xl bg-[var(--color-fill)] text-sm font-semibold" data-wa-texts-toggle>
          {showTexts ? "Hide" : "Show"} the {WA_TEMPLATE_LIST.length} templates · {WA_LANGS.find((l) => l.code === lang)?.label}
        </button>
        {showTexts && (
          <div className="space-y-3" data-wa-texts>
            <p className="text-xs text-steel">WhatsApp Manager → Message templates → Create. Category Utility, language as above, the name exactly, the body exactly. The numbers are filled in this order.</p>
            {WA_TEMPLATE_LIST.map((t) => (
              <div key={t.name} className="rounded-xl bg-[var(--color-fill)] p-4 space-y-2">
                <div className="flex items-center gap-2"><code className="text-xs font-semibold flex-1 min-w-0 truncate">{t.name}</code><CopyKey text={t.name} label={`Copy the name ${t.name}`} /></div>
                <div className="flex items-start gap-2"><p className="flex-1 min-w-0 text-sm leading-relaxed whitespace-pre-wrap break-words">{t.body[lang]}</p><CopyKey text={t.body[lang]} label={`Copy the text of ${t.name}`} /></div>
                <p className="text-xs text-steel">{t.params.map((p, i) => `{{${i + 1}}} ${p}`).join(" · ")}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<ListChecks size={16} />} title="Last messages" description={log.length ? `${log.length} most recent` : "Nothing sent yet"}>
        {log.length > 0 && (
          <ul className="divide-y divide-[var(--color-separator)]" data-wa-log>
            {log.map((r) => (
              <li key={r.id} className="py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold w-28 shrink-0">{KIND_LABEL[r.kind] ?? r.kind}</span>
                <span className="num text-sm text-[var(--color-label-2)]">{maskPhone(r.to)}</span>
                <span className={cn("ml-auto text-xs font-semibold px-2.5 py-1 rounded-full", STATUS_CLASS[r.status] ?? STATUS_CLASS.queued)} data-wa-status={r.status}>{r.status}</span>
                <span className="text-xs text-steel w-full sm:w-auto sm:order-first sm:mr-1">{when(r.created_at)}</span>
                {r.error && <span className="w-full text-xs text-[var(--color-red)] break-words">{r.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
