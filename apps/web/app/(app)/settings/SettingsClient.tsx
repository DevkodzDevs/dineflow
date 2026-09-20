"use client";
import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { Plus, Trash2, Sparkles, KeyRound, Server, Palette, Building2, CreditCard, LayoutGrid, ChevronRight, Shield, Wifi, Download, ExternalLink, MonitorSmartphone } from "lucide-react";
import { Button, Card, Field, cn } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { ThemePicker } from "@/components/ui/Theme";
import { InstallApp } from "@/components/InstallApp";
import { saveRestaurant, saveTable, deleteTable, loadDemoData, removeDemoData, issueBoxToken, savePayments } from "./actions";

type Rest = { id: string; name: string; room_gst_rate_high?: number; room_gst_threshold?: number; facility_gst_rate?: number; promise_enabled?: boolean; promise_minutes?: number; promise_pct?: number; upi_vpa?: string | null; upi_payee?: string | null; logo_url?: string | null; brand_colour?: string | null; gstin: string | null; address: string | null; phone: string | null; gst_rate: number; service_charge_pct: number; plan: string; property_type: string; room_gst_rate: number; check_in_time: string; check_out_time: string; membership: string; membership_plan: string | null; membership_ends_at: string | null; trial_ends_at: string; prep_buffer_pct: number; brief_whatsapp: string | null; runs_on_box?: boolean; box_last_seen?: string | null };
type Table = { id: string; name: string; capacity: number; zone: string; sort_order: number };
type Tab = "general" | "payments" | "tables" | "advanced";

const TABS: { key: Tab; label: string; icon: typeof Building2 }[] = [
  { key: "general", label: "General", icon: Building2 },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "tables", label: "Tables", icon: LayoutGrid },
  { key: "advanced", label: "Advanced", icon: Server },
];

function Section({ icon, title, children, description }: { icon: React.ReactNode; title: string; children: React.ReactNode; description?: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel">{icon}</span>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="text-xs text-steel mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function QuickLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-[var(--color-separator)] p-4 flex items-center gap-3 hover:border-[var(--color-label-3)] hover:bg-[var(--color-fill)]/50 transition-colors">
      <span className="h-10 w-10 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel group-hover:text-[var(--color-label)] transition-colors">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-steel mt-0.5">{hint}</div>
      </div>
      <ChevronRight size={16} className="text-steel shrink-0" />
    </Link>
  );
}

export function SettingsClient({ restaurant, tables, gateway, signInId, contactEmail }:
  { restaurant: Rest; tables: Table[]; gateway: { key_id: string; hasSecret: boolean; hasWebhook: boolean };
    signInId: string; contactEmail: string | null }) {
  const [promise, setPromise] = useState<boolean>(restaurant.promise_enabled ?? false);
  const [gstinOn, setGstinOn] = useState<boolean>(!!restaurant.gstin?.trim());
  const [msg, setMsg] = useState<string | null>(null);
  const [boxToken, setBoxToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState(""); useEffect(() => setOrigin(window.location.origin), []);
  const [tab, setTab] = useState<Tab>("general");
  const isHotel = restaurant.property_type !== "restaurant";

  return (
    <div className="space-y-6">
      {/* tab bar */}
      <div className="flex gap-1 p-1 bg-[var(--color-fill)] rounded-2xl w-fit max-w-full overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setMsg(null); }}
            className={cn("shrink-0 h-9 px-4 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors",
              tab === t.key ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {/* feedback */}
      {msg && (
        <div className={cn("rounded-xl px-4 py-2.5 text-sm",
          /error|fail|not/i.test(msg) ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-green-2)] text-[var(--color-green)]")}>
          {msg}
        </div>
      )}

      {/* ═══════ GENERAL ═══════ */}
      {tab === "general" && (
        <div className="space-y-6">
          {/* appearance */}
          <Card>
            <Section icon={<Palette size={16} />} title="Appearance" description="Applies to this device. Guest pages are always bright.">
              <ThemePicker />
            </Section>
          </Card>

          {/* install — sits beside Appearance because it is the other thing that belongs to the
              device in front of you rather than to the property */}
          <Card>
            <Section icon={<MonitorSmartphone size={16} />} title="Install on this device" description="Applies to this device. Every phone and till installs itself.">
              <InstallApp />
              {/* the address to hand staff: it works out what they are holding and gives them the one file for it */}
              <Link href="/get" className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--color-separator)] p-3.5 hover:border-[var(--color-label-3)] hover:bg-[var(--color-fill)] transition-colors">
                <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><Download size={16} /></span>
                <span className="flex-1 min-w-0"><span className="block text-sm font-semibold">Installers for everyone else</span><span className="block text-xs text-steel mt-0.5">A page to send staff — Windows, Android or iPhone, it gives them the right one</span></span>
                <ChevronRight size={16} className="text-steel shrink-0" />
              </Link>
            </Section>
          </Card>

          {/* property info */}
          <Card>
            <Section icon={<Building2 size={16} />} title="Property details">
              <form className="space-y-4" action={(fd) => start(async () => { const r = await saveRestaurant(fd); setMsg("error" in r ? r.error! : "Saved."); })}>
                <input type="hidden" name="id" value={restaurant.id} />
                <Field label="Property type" hint="Hotel and resort unlock Front desk, Rooms, Housekeeping, Guests.">
                  <select name="property_type" defaultValue={restaurant.property_type}>
                    <option value="restaurant">Restaurant</option><option value="hotel">Hotel</option><option value="resort">Resort</option>
                  </select>
                </Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Name"><input name="name" defaultValue={restaurant.name} required /></Field>
                  <Field label="Phone"><input name="phone" defaultValue={restaurant.phone ?? ""} className="num" /></Field>
                </div>
                <Field label="Address"><input name="address" defaultValue={restaurant.address ?? ""} /></Field>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Logo URL" hint="Square PNG or SVG, at least 256 px"><input name="logo_url" defaultValue={restaurant.logo_url ?? ""} placeholder="https://…/logo.png" /></Field>
                  <Field label="Brand colour" hint="Hex, e.g. #c9302c"><input name="brand_colour" defaultValue={restaurant.brand_colour ?? ""} placeholder="#c9302c" className="num" /></Field>
                </div>

                <div className="pt-3 border-t border-[var(--color-separator)]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">On-time promise</div>
                  <label className="flex items-start gap-2.5 normal-case tracking-normal text-sm">
                    <input type="checkbox" name="promise_enabled" className="w-4 h-4 accent-saffron mt-0.5" defaultChecked={restaurant.promise_enabled ?? false} onChange={(e) => setPromise(e.target.checked)} />
                    <span>Offer guests a delivery deadline<span className="block text-xs text-steel mt-0.5">A guest can be offered “on your table in {restaurant.promise_minutes ?? 30} minutes, or the food is free”. They pay the percentage below for it. Miss the deadline and the whole bill comes to zero — the fee included.</span></span>
                  </label>
                  {promise && (
                    <div className="grid sm:grid-cols-2 gap-3 mt-3">
                      <Field label="Minutes promised" hint="From the moment the order is taken to the food reaching the guest">
                        <input name="promise_minutes" type="number" min={5} max={240} step={1} defaultValue={restaurant.promise_minutes ?? 30} className="num" />
                      </Field>
                      <Field label="Charged for it %" hint="Added to the food after any discount, and taxed with it">
                        <input name="promise_pct" type="number" min={0} max={50} step="0.5" defaultValue={restaurant.promise_pct ?? 5} className="num" />
                      </Field>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--color-separator)]">
                  <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">Tax & billing</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="GSTIN" hint={gstinOn ? undefined : "Empty — no tax is added to any bill"}><input name="gstin" defaultValue={restaurant.gstin ?? ""} className="num uppercase" onChange={(e) => setGstinOn(e.target.value.trim() !== "")} /></Field>
                    <Field label="GST rate %" hint="5% for most; split as CGST + SGST"><input name="gst_rate" type="number" step="0.01" defaultValue={restaurant.gst_rate} className="num" /></Field>
                  </div>
                  {!gstinOn && (
                    <p className="text-xs mt-2 text-[var(--color-orange)]">
                      No GSTIN is saved, so bills carry no CGST or SGST. That is the law for a business that is not registered — collecting tax without a registration is not allowed. If you are registered, type the GSTIN above and tax starts appearing on the next bill.
                    </p>
                  )}
                  <div className={cn("grid gap-3 mt-3", isHotel ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                    <Field label="Service charge %"><input name="service_charge_pct" type="number" step="0.01" defaultValue={restaurant.service_charge_pct} className="num" /></Field>
                    {isHotel && <Field label="Room GST % (up to the slab)" hint="5% since 22 Sep 2025"><input name="room_gst_rate" type="number" step="0.01" defaultValue={restaurant.room_gst_rate} className="num" /></Field>}
                    {isHotel && <Field label="Check-in / out"><div className="grid grid-cols-2 gap-2"><input name="check_in_time" type="time" defaultValue={restaurant.check_in_time?.slice(0, 5)} className="num" /><input name="check_out_time" type="time" defaultValue={restaurant.check_out_time?.slice(0, 5)} className="num" /></div></Field>}
                  </div>
                  {isHotel && (
                    <div className="grid sm:grid-cols-3 gap-3 mt-3">
                      <Field label="Slab at ₹ / night" hint="Above this, the higher rate applies">
                        <input name="room_gst_threshold" type="number" step="1" defaultValue={restaurant.room_gst_threshold ?? 7500} className="num" />
                      </Field>
                      <Field label="Room GST % above the slab" hint="18% since 22 Sep 2025">
                        <input name="room_gst_rate_high" type="number" step="0.01" defaultValue={restaurant.room_gst_rate_high ?? 18} className="num" />
                      </Field>
                      <Field label="Extras GST %" hint="Spa, laundry, transport on the folio">
                        <input name="facility_gst_rate" type="number" step="0.01" defaultValue={restaurant.facility_gst_rate ?? 18} className="num" />
                      </Field>
                    </div>
                  )}
                  {isHotel && <p className="text-xs text-steel mt-2">Each night is taxed on the rate that night was sold at, so a ₹4,000 room and a ₹9,000 suite carry different rates on the same invoice — which is what the law asks for.</p>}
                  {!isHotel && <><input type="hidden" name="room_gst_rate" value={restaurant.room_gst_rate} /><input type="hidden" name="room_gst_rate_high" value={restaurant.room_gst_rate_high ?? 18} /><input type="hidden" name="room_gst_threshold" value={restaurant.room_gst_threshold ?? 7500} /><input type="hidden" name="facility_gst_rate" value={restaurant.facility_gst_rate ?? 18} /><input type="hidden" name="check_in_time" value={restaurant.check_in_time} /><input type="hidden" name="check_out_time" value={restaurant.check_out_time} /></>}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Prep buffer %" hint="Extra the Tomorrow brief adds"><input name="prep_buffer_pct" type="number" className="num" defaultValue={restaurant.prep_buffer_pct ?? 10} /></Field>
                  <Field label="WhatsApp for the brief" hint="'Send to the team' opens this"><input name="brief_whatsapp" className="num" defaultValue={restaurant.brief_whatsapp ?? ""} placeholder="98400 11223" /></Field>
                </div>

                <Button className="w-full sm:w-auto" disabled={pending}>Save changes</Button>
              </form>
            </Section>
          </Card>

          {/* account & security */}
          <Card>
            <Section icon={<Shield size={16} />} title="Account & security">
              <div className="rounded-xl bg-[var(--color-fill)] p-4 flex items-start gap-4">
                <KeyRound size={18} className="text-steel shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">Your password</div>
                  <p className="text-xs text-steel mt-1">
                    Signed in as <span className="num">{signInId}</span>.
                    {contactEmail
                      ? <> Codes go to <span className="num">{contactEmail}</span>.</>
                      : <> No contact address — ask Master control to add one.</>}
                  </p>
                </div>
                <a href="/account/password" className="btn btn-gray !h-9 !px-3.5 !text-[13px] !rounded-[11px] shrink-0">
                  Change
                </a>
              </div>
              <div className="text-xs text-steel flex items-center justify-between px-1">
                <span>Membership: <b className="uppercase">{restaurant.membership}</b>{restaurant.membership_plan ? ` · ${restaurant.membership_plan}` : ""}{restaurant.membership === "trial" ? ` · ends ${restaurant.trial_ends_at.slice(0, 10)}` : restaurant.membership_ends_at ? ` · until ${restaurant.membership_ends_at.slice(0, 10)}` : ""}</span>
                <Link href="/membership" className="font-semibold underline text-[var(--color-label)]">Manage</Link>
              </div>
            </Section>
          </Card>

          {/* quick links */}
          <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-3">
            <QuickLink href="/settings/storefront" icon={<ExternalLink size={16} />} label="Storefront & offers" hint="Your listing, delivery, offers" />
            <QuickLink href="/settings/printers" icon={<Download size={16} />} label="Thermal printers" hint="Bill and KOT printers" />
            <QuickLink href="/channels" icon={<Wifi size={16} />} label="Online orders & OTA" hint="Swiggy, Zomato, Booking.com" />
            <QuickLink href="/settings/booking-page" icon={<ExternalLink size={16} />} label="Direct booking page" hint="Your own booking link" />
            <QuickLink href="/tax" icon={<Building2 size={16} />} label="Tax & GST" hint="Returns, filings, documents" />
          </div>
        </div>
      )}

      {/* ═══════ PAYMENTS ═══════ */}
      {tab === "payments" && (
        <Card>
          <Section icon={<CreditCard size={16} />} title="Pay by scanning the bill"
            description="Every bill carries a QR code. Scanning it opens the bill on the guest's phone.">
            <form className="space-y-4" action={(fd) => start(async () => { const r = await savePayments(fd); setMsg("error" in r ? r.error! : "Saved."); })}>
              <input type="hidden" name="id" value={restaurant.id} />

              <div className="rounded-xl bg-[var(--color-fill)] p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-steel">UPI</div>
                <p className="text-xs text-steel">Add your UPI ID and every bill gets a scannable QR. Nothing else needed.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="UPI ID"><input name="upi_vpa" defaultValue={restaurant.upi_vpa ?? ""} placeholder="hotel@okaxis" className="num" autoCapitalize="none" /></Field>
                  <Field label="Payee name" hint="Blank = property name"><input name="upi_payee" defaultValue={restaurant.upi_payee ?? ""} /></Field>
                </div>
              </div>

              <div className="rounded-xl bg-[var(--color-fill)] p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-steel">Razorpay (cards, netbanking, wallets)</div>
                <p className="text-xs text-steel">Optional. Add your API keys from Razorpay dashboard → Account & Settings → API keys.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Key ID"><input name="razorpay_key_id" defaultValue={gateway.key_id} placeholder="rzp_live_…" className="num" autoCapitalize="none" /></Field>
                  <Field label="Key secret" hint={gateway.hasSecret ? "Saved. Blank keeps it; 'clear' removes." : ""}>
                    <PasswordInput name="razorpay_key_secret" autoComplete="new-password" placeholder={gateway.hasSecret ? "••••••••" : ""} />
                  </Field>
                </div>
                <Field label="Webhook secret" hint={`Add a webhook for payment.captured at ${origin || "https://…"}/api/webhooks/razorpay${gateway.hasWebhook ? ". Saved." : ""}`}>
                  <PasswordInput name="razorpay_webhook_secret" autoComplete="new-password" placeholder={gateway.hasWebhook ? "••••••••" : ""} />
                </Field>
              </div>

              <Button className="w-full sm:w-auto" disabled={pending}>Save payment settings</Button>
            </form>
          </Section>
        </Card>
      )}

      {/* ═══════ TABLES ═══════ */}
      {tab === "tables" && (
        <Card>
          <Section icon={<LayoutGrid size={16} />} title="Tables & zones"
            description={`${tables.length} table${tables.length === 1 ? "" : "s"} across ${new Set(tables.map((t) => t.zone)).size} zone${new Set(tables.map((t) => t.zone)).size === 1 ? "" : "s"}.`}>

            {tables.length > 0 && (
              <div className="rounded-xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)]">
                {tables.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="h-9 w-9 rounded-lg bg-[var(--color-fill)] grid place-items-center font-display text-sm font-bold shrink-0">{t.name}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm">{t.zone}</span>
                      <span className="text-xs text-steel ml-2">seats {t.capacity}</span>
                    </div>
                    <button className="h-8 w-8 grid place-items-center rounded-lg text-steel hover:text-[var(--color-red)] hover:bg-[var(--color-red-2)] transition-colors"
                      disabled={pending} onClick={() => start(() => { deleteTable(t.id); })} aria-label={`Delete ${t.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form className="rounded-xl bg-[var(--color-fill)] p-4"
              action={(fd) => start(async () => { await saveTable(fd); })}>
              <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">Add a table</div>
              <input type="hidden" name="sort_order" value={tables.length + 1} />
              <div className="grid grid-cols-[1fr_80px_1fr_auto] gap-2 items-end">
                <Field label="Name"><input name="name" placeholder="T9" required /></Field>
                <Field label="Seats"><input name="capacity" type="number" defaultValue={4} className="num" /></Field>
                <Field label="Zone"><input name="zone" placeholder="AC hall" defaultValue="Main" /></Field>
                <Button disabled={pending} aria-label="Add table"><Plus size={16} /></Button>
              </div>
            </form>
          </Section>
        </Card>
      )}

      {/* ═══════ ADVANCED ═══════ */}
      {tab === "advanced" && (
        <div className="space-y-6">
          {/* box mode */}
          <Card>
            <Section icon={<Server size={16} />} title="Runs on a Box"
              description="A computer in the building that works with and without internet.">
              <div className="rounded-xl bg-[var(--color-fill)] p-4 space-y-3">
                <p className="text-xs text-steel leading-relaxed">
                  Issue a token and paste it into the Box launcher. The Box then works offline: orders, billing and the kitchen run locally.
                  Every minute the internet is up it syncs with this cloud copy.
                  {restaurant.runs_on_box && <span className="text-[var(--color-tint)] font-semibold"> Box connected{restaurant.box_last_seen ? ` · last seen ${new Date(restaurant.box_last_seen).toLocaleString("en-IN")}` : ""}.</span>}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => {
                    const r = await issueBoxToken();
                    if ("error" in r) setMsg(r.error!);
                    else { setBoxToken(r.token!); navigator.clipboard.writeText(r.token!); setMsg("Box token copied to clipboard."); }
                  })}>Issue box token</Button>
                  {boxToken && <span className="num text-xs text-steel break-all">{boxToken}</span>}
                </div>
              </div>
            </Section>
          </Card>

          {/* sample data */}
          <Card>
            <Section icon={<Sparkles size={16} />} title="Sample data"
              description="Fill the property with a realistic menu, pantry, tables, rooms, bookings and channels for testing.">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={pending} onClick={() => start(async () => {
                  const r = await loadDemoData();
                  setMsg(r.error ? r.error : `Loaded: ${r.dishes} dishes, ${r.ingredients} pantry items, ${r.rooms ?? 0} rooms, ${r.labourers} workers`);
                })}><Sparkles size={15} /> Load demo data</Button>
                <Button variant="ghost" disabled={pending} onClick={() => {
                  if (confirm("Remove the demo channels and sample online orders?"))
                    start(async () => { await removeDemoData(); setMsg("Demo channels removed."); });
                }}><Trash2 size={15} /> Remove demo channels</Button>
              </div>
            </Section>
          </Card>
        </div>
      )}
    </div>
  );
}
