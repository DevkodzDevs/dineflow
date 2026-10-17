"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { Plus, Trash2, Sparkles, KeyRound, Server, Palette, Building2, CreditCard, LayoutGrid, ChevronRight, Shield, Wifi, Download, ExternalLink, MonitorSmartphone, HeartHandshake, QrCode, BellRing, Receipt, BedDouble, ChefHat, Timer, Sunrise, Mail, Crown, Check, AlertTriangle, Loader2, Fingerprint } from "lucide-react";
import { NotificationSettings } from "@/components/shell/Notifier";
import { LogoUpload } from "./LogoUpload";
import { AttendanceSettings } from "./AttendanceSettings";
import { Button, Card, Field, Switch, cn } from "@/components/ui";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { ThemePicker } from "@/components/ui/Theme";
import { LangPicker } from "@/components/ui/Say";
import { InstallApp } from "@/components/InstallApp";
import { saveRestaurant, saveTable, deleteTable, loadDemoData, removeDemoData, issueBoxToken, savePayments, saveLoyalty } from "./actions";
import { copyText } from "@/lib/clipboard";

type Rest = { id: string; name: string; booking_slug?: string | null; loyalty_enabled?: boolean; loyalty_earn_pct?: number; loyalty_point_value?: number; loyalty_min_redeem?: number; kds_stations?: string[] | null; kds_warn_minutes?: number; kds_target_minutes?: number; hk_inspect_required?: boolean; room_gst_rate_high?: number; room_gst_threshold?: number; facility_gst_rate?: number; promise_enabled?: boolean; promise_minutes?: number; promise_pct?: number; upi_vpa?: string | null; upi_payee?: string | null; logo_url?: string | null; brand_colour?: string | null; gstin: string | null; address: string | null; phone: string | null; gst_rate: number; service_charge_pct: number; plan: string; property_type: string; room_gst_rate: number; check_in_time: string; check_out_time: string; membership: string; membership_plan: string | null; membership_ends_at: string | null; trial_ends_at: string; prep_buffer_pct: number; brief_whatsapp: string | null; runs_on_box?: boolean; box_last_seen?: string | null; attendance_methods?: string[]; attend_lat?: number | null; attend_lng?: number | null; attend_radius_m?: number; stock_draw?: "ticket" | "cook" };
type Table = { id: string; name: string; capacity: number; zone: string; sort_order: number; qr_token?: string | null };
type Tab = "general" | "payments" | "tables" | "attendance" | "advanced";

const TABS: { key: Tab; label: string; icon: typeof Building2 }[] = [
  { key: "general", label: "General", icon: Building2 },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "tables", label: "Tables", icon: LayoutGrid },
  { key: "attendance", label: "Attendance", icon: Fingerprint },
  { key: "advanced", label: "Advanced", icon: Server },
];

function Section({ icon, title, children, description }: { icon: React.ReactNode; title: string; children: React.ReactNode; description?: string }) {
  return (
    <div className="settings-section space-y-4">
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel">{icon}</span>
        <div className="min-w-0 pt-1">
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

export function SettingsClient({ restaurant, tables, gateway, signInId, contactEmail, owner = false, phoneReady = true }:
  { restaurant: Rest; tables: Table[]; gateway: { key_id: string; hasSecret: boolean; hasWebhook: boolean };
    signInId: string; contactEmail: string | null; owner?: boolean; phoneReady?: boolean }) {
  const [promise, setPromise] = useState<boolean>(restaurant.promise_enabled ?? false);
  const [gstinOn, setGstinOn] = useState<boolean>(!!restaurant.gstin?.trim());
  const [msg, setMsg] = useState<string | null>(null);
  const [boxToken, setBoxToken] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* the property form's save bar: what is unsaved, and whether the bar is floating (pinned at the
     bottom of the screen, beside the Assist button) or resting at the end of the form */
  const [dirty, setDirty] = useState(false);
  const [floating, setFloating] = useState(false);
  const barEnd = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState(""); useEffect(() => setOrigin(window.location.origin), []);
  const [tab, setTab] = useState<Tab>("general");
  useEffect(() => {
    const el = barEnd.current; if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setFloating(!e.isIntersecting && e.boundingClientRect.top > 0), { rootMargin: "0px 0px -90px 0px" });
    io.observe(el); return () => io.disconnect();
  }, [tab]);
  const [loyaltyOn, setLoyaltyOn] = useState(!!restaurant.loyalty_enabled);
  const isHotel = restaurant.property_type !== "restaurant";

  return (
    <div className="space-y-6">
      {/* tab bar */}
      <div className="flex gap-1 p-1 bg-[var(--color-fill)] rounded-2xl w-fit max-w-full overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={(e) => { setTab(t.key); setMsg(null); e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" }); }}
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
              {/* the second line under the Dining screens' buttons — Tamil or Hindi (lib/say.ts) */}
              <div className="mt-5 mb-2 text-[13px] font-semibold text-[var(--color-label-2)]">Words on the buttons</div>
              <LangPicker />
            </Section>
          </Card>

          {/* notifications — like Appearance, a choice for this device: the kitchen screen and the
              front desk each pick their own tone and alerts */}
          <Card>
            <div id="notifications" className="scroll-mt-28">
              <Section icon={<BellRing size={16} />} title="Notifications" description="Applies to this device. Pick what this machine is, its tone, and what it alerts about.">
                <NotificationSettings />
              </Section>
            </div>
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

          {/* The property's settings, one card per subject — they were all one long form under
              "Property details". Still one <form> and one Save (saveRestaurant reads every field),
              with the save bar pinned to the bottom so it is in reach from any card. */}
          <form className="space-y-6" onInput={(e) => { if ((e.target as HTMLInputElement).type !== "file") { setDirty(true); setMsg(null); } }}
            action={(fd) => start(async () => { const r = await saveRestaurant(fd); if ("error" in r) setMsg(r.error!); else { setMsg("Saved."); setDirty(false); } })}>
            <input type="hidden" name="id" value={restaurant.id} />
            <Card>
              <Section icon={<Building2 size={16} />} title="Property details" description="What the property is and how guests reach it.">
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
              </Section>
            </Card>

            <Card>
              <Section icon={<Palette size={16} />} title="Brand" description="Your logo and colour — on the sidebar, receipts, the storefront and booking page.">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
                  <LogoUpload restaurantId={restaurant.id} initial={restaurant.logo_url ?? null} name={restaurant.name} />
                  <Field label="Brand colour" hint="Hex, e.g. #c9302c"><input name="brand_colour" defaultValue={restaurant.brand_colour ?? ""} placeholder="#c9302c" className="num" /></Field>
                </div>
              </Section>
            </Card>

            <Card>
              <Section icon={<Receipt size={16} />} title="Tax & billing" description={`GST and service charge on every bill${isHotel ? ", and the room-night GST slabs" : ""}.`}>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="GSTIN" hint={gstinOn ? undefined : "Empty — no tax is added to any bill"}><input name="gstin" defaultValue={restaurant.gstin ?? ""} className="num uppercase" onChange={(e) => setGstinOn(e.target.value.trim() !== "")} /></Field>
                  <Field label="GST rate %" hint="5% for most; split as CGST + SGST"><input name="gst_rate" type="number" step="0.01" defaultValue={restaurant.gst_rate} className="num" /></Field>
                </div>
                {!gstinOn && (
                  <p className="text-xs mt-2 text-[var(--color-orange)]">
                    No GSTIN is saved, so bills carry no CGST or SGST. That is the law for a business that is not registered — collecting tax without a registration is not allowed. If you are registered, type the GSTIN above and tax starts appearing on the next bill.
                  </p>
                )}
                <div className="grid gap-3 mt-3 sm:grid-cols-2">
                  <Field label="Service charge %"><input name="service_charge_pct" type="number" step="0.01" defaultValue={restaurant.service_charge_pct} className="num" /></Field>
                  {isHotel && <Field label="Room GST % (up to the slab)" hint="5% since 22 Sep 2025"><input name="room_gst_rate" type="number" step="0.01" defaultValue={restaurant.room_gst_rate} className="num" /></Field>}
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
              </Section>
            </Card>

            {isHotel && (
              <Card>
                <Section icon={<BedDouble size={16} />} title="Rooms & stays" description="Check-in times and the housekeeping rule.">
                  <Field label="Check-in and check-out" hint="Shown on bookings and the guest's confirmation"><div className="grid grid-cols-2 gap-2"><input name="check_in_time" type="time" defaultValue={restaurant.check_in_time?.slice(0, 5)} className="num" /><input name="check_out_time" type="time" defaultValue={restaurant.check_out_time?.slice(0, 5)} className="num" /></div></Field>
                  <label className="flex items-start gap-2.5 normal-case tracking-normal text-sm">
                    <input type="checkbox" name="hk_inspect_required" className="mt-0.5" defaultChecked={restaurant.hk_inspect_required ?? false} />
                    <span>A supervisor inspects every room before it is sold<span className="block text-xs text-steel mt-0.5">The five-star rule. A cleaned room waits as “clean” until an owner, manager or supervisor signs it off on the Housekeeping page, and check-in is refused until then. Off, a finished clean puts the room back on sale at once.</span></span>
                  </label>
                </Section>
              </Card>
            )}

            <Card>
              <Section icon={<ChefHat size={16} />} title="Kitchen" description="Stations on the kitchen board, and when a ticket turns amber and red.">
                <Field label="Stations" hint="Comma-separated. Each station gets its own view of the kitchen board — Grill, Tandoor, Fry, Bar, Dessert. Point categories at them on the Menu page.">
                  <input name="kds_stations" defaultValue={(restaurant.kds_stations ?? []).join(", ")} placeholder="Grill, Tandoor, Bar" />
                </Field>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Hurry after (minutes)" hint="The ticket turns amber"><input name="kds_warn_minutes" type="number" min={1} max={120} step={1} defaultValue={restaurant.kds_warn_minutes ?? 10} className="num" /></Field>
                  <Field label="Late after (minutes)" hint="The ticket turns red and counts against speed of service"><input name="kds_target_minutes" type="number" min={1} max={240} step={1} defaultValue={restaurant.kds_target_minutes ?? 15} className="num" /></Field>
                </div>
                {/* when a dish's recipe leaves the pantry (0092): the moment the ticket is sent, or when the
                    kitchen presses Start cooking. A kitchen that only prints tickets never presses Start. */}
                <div className="mt-4" data-stock-draw>
                  <div className="text-[13px] font-semibold mb-1.5">Pantry stock leaves when…</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {([["ticket", "the order reaches the kitchen", "Recommended. Every dish sent is taken out of the pantry at once; a dish cancelled before cooking goes straight back."],
                       ["cook", "the kitchen presses Start cooking", "For a kitchen that works the board. Until it presses Start, the pantry still shows the stock on the shelf."]] as const).map(([v, t, d]) => (
                      <label key={v} className="flex items-start gap-2.5 rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-3 cursor-pointer has-[:checked]:border-[var(--color-tint)] has-[:checked]:bg-[var(--color-green-2)] normal-case tracking-normal">
                        <input type="radio" name="stock_draw" value={v} defaultChecked={(restaurant.stock_draw ?? "ticket") === v} className="mt-0.5" />
                        <span className="min-w-0"><span className="block text-[14px] font-semibold">{t}</span><span className="block text-xs font-normal text-[var(--color-label-2)] mt-0.5">{d}</span></span>
                      </label>))}
                  </div>
                </div>
              </Section>
            </Card>

            <Card>
              <Section icon={<Timer size={16} />} title="On-time promise" description="An optional delivery deadline you can sell with an order.">
                <label className="flex items-start gap-2.5 normal-case tracking-normal text-sm">
                  <input type="checkbox" name="promise_enabled" className="mt-0.5" defaultChecked={restaurant.promise_enabled ?? false} onChange={(e) => setPromise(e.target.checked)} />
                  <span>Offer guests a delivery deadline<span className="block text-xs text-steel mt-0.5">A guest can be offered “on your table in {restaurant.promise_minutes ?? 30} minutes, or the food is free”. They pay the percentage below for it. Miss the deadline and the whole bill comes to zero — the fee included.</span></span>
                </label>
                {/* switched off, the two fields are not on the page — carry the saved values, or every Save
                    would reset the rate to 0 and the window to 30 minutes */}
                {!promise && <><input type="hidden" name="promise_minutes" value={restaurant.promise_minutes ?? 30} /><input type="hidden" name="promise_pct" value={restaurant.promise_pct ?? 5} /></>}
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
              </Section>
            </Card>

            <Card>
              <Section icon={<Sunrise size={16} />} title="Tomorrow brief" description="How the next day's prep list is worked out and where it is sent.">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Prep buffer %" hint="Extra the Tomorrow brief adds"><input name="prep_buffer_pct" type="number" className="num" defaultValue={restaurant.prep_buffer_pct ?? 10} /></Field>
                  <Field label="WhatsApp for the brief" hint="'Send to the team' opens this"><input name="brief_whatsapp" className="num" defaultValue={restaurant.brief_whatsapp ?? ""} placeholder="98400 11223" /></Field>
                </div>
              </Section>
            </Card>

            {/* One save for all the cards above. Pinned at the bottom of the screen it floats — rounded,
                lifted, and ending before the Assist button that sits beside it; at the end of the form
                it rests as a card the width of the others. It says what state the cards are in rather
                than a fixed sentence, and Save is live only when there is something to save. */}
            {(() => {
              const failed = !!msg && !pending && /error|fail|not|cannot|only/i.test(msg);
              const saved = !pending && !dirty && msg === "Saved.";
              const title = pending ? "Saving…" : failed ? "Couldn't save" : dirty ? "Unsaved changes" : saved ? "All changes saved" : "No changes yet";
              const sub = pending ? "Saving all the cards" : failed ? msg : dirty ? "Saves all the cards at once" : saved ? "Saved just now" : "Edit a card, then save";
              return (
                <div className={cn("settings-savebar sticky bottom-[calc(env(safe-area-inset-bottom)+92px)] md:bottom-4 z-10 flex items-center gap-3 border transition-[margin,border-radius,box-shadow,background-color] duration-200",
                  floating
                    ? "mr-[72px] rounded-[22px] pl-2.5 pr-2 py-2 material-thick border-[var(--color-separator)] shadow-[var(--shadow-pop)]"
                    : "rounded-[22px] pl-3 pr-3 py-3 bg-[var(--color-bg-2)] border-[var(--color-separator)]")}>
                  <span aria-hidden className={cn("h-10 w-10 shrink-0 rounded-full grid place-items-center",
                    pending ? "bg-[var(--color-fill)] text-[var(--color-label-2)]"
                      : failed ? "bg-[var(--color-red-2)] text-[var(--color-red)]"
                        : dirty ? "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]"
                          : saved ? "bg-[var(--color-green-2)] text-[var(--color-green)]"
                            : "bg-[var(--color-fill)] text-[var(--color-label-3)]")}>
                    {pending ? <Loader2 size={17} className="animate-spin" /> : failed ? <AlertTriangle size={17} /> : dirty ? <span className="h-2.5 w-2.5 rounded-full bg-current pulse-dot" /> : <Check size={18} strokeWidth={2.6} />}
                  </span>
                  <span role="status" className="flex-1 min-w-0 leading-tight">
                    <span className={cn("block text-[14px] font-semibold truncate", failed && "text-[var(--color-red)]")}>{title}</span>
                    <span className="block text-[12px] text-[var(--color-label-2)] line-clamp-2 [overflow-wrap:anywhere] mt-0.5">{sub}</span>
                  </span>
                  <Button disabled={pending || !dirty} className="shrink-0 !rounded-full !h-11 !px-5"><span className="sm:hidden">Save</span><span className="hidden sm:inline">Save changes</span></Button>
                </div>
              );
            })()}
            <div ref={barEnd} aria-hidden className="h-px -mt-6" />
          </form>

          {/* account & security */}
          <Card>
            <Section icon={<Shield size={16} />} title="Account & security" description="How you sign in, where codes are sent, and your DineFlow plan.">
              {/* three rows in one panel: each an icon tile, a title over one line of detail, and its
                  action at the end — "Signed in as ." no longer shows when there is no sign-in ID */}
              <div className="rounded-2xl border border-[var(--color-separator)] overflow-hidden divide-y divide-[var(--color-separator)]">
                <div className="flex items-center gap-3.5 px-4 py-3.5">
                  <span className="h-11 w-11 shrink-0 rounded-2xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)]"><KeyRound size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold">Password</span>
                    <span className="block text-[12.5px] leading-snug text-[var(--color-label-2)] line-clamp-2 [overflow-wrap:anywhere] mt-0.5">{signInId ? <>Sign-in ID <span className="text-[var(--color-label)] font-medium">{signInId}</span></> : "Signed in from Master control"}</span>
                  </span>
                  <a href="/account/password" className="btn btn-gray !h-11 !px-4 !rounded-full shrink-0 inline-flex items-center gap-1 text-[14px] font-semibold">Change <ChevronRight size={15} className="-mr-1" /></a>
                </div>
                <div className="flex items-center gap-3.5 px-4 py-3.5">
                  <span className={cn("h-11 w-11 shrink-0 rounded-2xl grid place-items-center", contactEmail ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]")}><Mail size={18} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold">Recovery email</span>
                    <span className="block text-[12.5px] leading-snug text-[var(--color-label-2)] line-clamp-2 [overflow-wrap:anywhere] mt-0.5">{contactEmail ? <>Codes go to <span className="text-[var(--color-label)] font-medium">{contactEmail}</span></> : "Not set — ask Master control to add one"}</span>
                  </span>
                  {contactEmail
                    ? <span className="h-7 w-7 shrink-0 rounded-full grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]" aria-label="Set"><Check size={15} strokeWidth={2.6} /></span>
                    : <span className="shrink-0 h-7 px-2.5 rounded-full grid place-items-center text-[11.5px] font-semibold bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]">Missing</span>}
                </div>
                {(() => {
                  const m = restaurant.membership;
                  const ends = m === "trial" ? restaurant.trial_ends_at : restaurant.membership_ends_at;
                  const when = ends ? new Date(ends).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null;
                  const plan = restaurant.membership_plan ? `${restaurant.membership_plan[0].toUpperCase()}${restaurant.membership_plan.slice(1)} plan` : m === "trial" ? "Free trial" : "Plan";
                  const detail = when ? `${plan} · ${m === "trial" ? "ends" : m === "active" ? "renews by" : "ended"} ${when}` : plan;
                  const tone = m === "active" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : m === "trial" ? "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]" : "bg-[var(--color-red-2)] text-[var(--color-red)]";
                  return (
                    <Link href="/membership" className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-[var(--color-fill)] transition-colors">
                      <span className="h-11 w-11 shrink-0 rounded-2xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)]"><Crown size={18} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold">Membership</span>
                        <span className="block text-[12.5px] leading-snug text-[var(--color-label-2)] line-clamp-2 [overflow-wrap:anywhere] mt-0.5">{detail}</span>
                      </span>
                      <span className={cn("shrink-0 h-7 px-2.5 rounded-full grid place-items-center text-[11.5px] font-bold uppercase tracking-wide", tone)}>{m}</span>
                      <ChevronRight size={17} className="shrink-0 text-[var(--color-label-3)] -mr-1" aria-label="Manage" />
                    </Link>
                  );
                })()}
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
          <Section icon={<HeartHandshake size={16} />} title="Loyalty points"
            description="A share of what a guest spends comes back as points, earned when the bill is paid and taken off a later one. Guests are known by their phone number.">
            <form className="space-y-4" action={(fd) => start(async () => { const r = await saveLoyalty(fd); setMsg("error" in r ? r.error! : "Saved."); })}>
              <input type="hidden" name="id" value={restaurant.id} />
              {/* a switch row like Storefront's, not a bare checkbox floating under the description;
                  the form still posts loyalty_enabled from a checkbox kept in step and out of sight */}
              <label className="card p-3.5 flex items-center gap-3 cursor-pointer">
                <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold">Give points on paid bills</span><span className="block text-xs text-[var(--color-label-2)] mt-0.5">{loyaltyOn ? "On — every paid bill earns points" : "Off — nobody earns or spends points"}</span></span>
                <Switch on={loyaltyOn} onChange={setLoyaltyOn} name="Give points on paid bills" />
                <input type="checkbox" name="loyalty_enabled" checked={loyaltyOn} readOnly hidden style={{ display: "none" }} />
              </label>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Earn" hint="% of the food value, after discounts"><input name="loyalty_earn_pct" type="number" step="0.5" min={0} max={50} className="num" defaultValue={Number(restaurant.loyalty_earn_pct ?? 5)} /></Field>
                <Field label="A point is worth (₹)"><input name="loyalty_point_value" type="number" step="0.1" min={0.1} className="num" defaultValue={Number(restaurant.loyalty_point_value ?? 1)} /></Field>
                <Field label="Redeem from" hint="points a guest must hold"><input name="loyalty_min_redeem" type="number" min={0} className="num" defaultValue={Number(restaurant.loyalty_min_redeem ?? 50)} /></Field>
              </div>
              <p className="text-xs text-steel">At 5% and ₹1 a point, a ₹1,000 meal earns 50 points — ₹50 off the next visit. Points are taken off the food before tax, so the GST follows what was actually charged.</p>
              <Button className="w-full sm:w-auto" disabled={pending}>Save loyalty</Button>
            </form>
          </Section>
        </Card>
      )}

      {/* ═══════ TABLES ═══════ */}
      {tab === "tables" && (
        <Card>
          <Section icon={<QrCode size={16} />} title="Order from the table"
            description="Every table has its own QR code. A guest scans it, sees the menu on their phone, and the order lands on that table — in Online orders, or straight in the kitchen when the website channel accepts on its own.">
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Link href="/settings/table-qr" className="btn btn-filled"><QrCode size={16} /> Print table codes</Link>
              <Link href="/channels" className="btn btn-gray">Accept on their own · Channels</Link>
              {!restaurant.booking_slug && <span className="text-xs text-steel">Set the property&apos;s web name under Storefront first.</span>}
            </div>
          </Section>
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
                    {t.qr_token && restaurant.booking_slug && <a href={`/dine/${restaurant.booking_slug}?t=${t.qr_token}`} target="_blank" rel="noreferrer" className="h-10 w-10 grid place-items-center rounded-lg text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)] transition-colors text-[11px] font-semibold" title="Open what a guest sees when they scan this table's code"><QrCode size={14} /></a>}
                    <button className="h-8 w-8 grid place-items-center rounded-lg text-steel hover:text-[var(--color-red)] hover:bg-[var(--color-red-2)] transition-colors"
                      disabled={pending} onClick={() => start(async () => { const r = await deleteTable(t.id); if ("error" in r) setMsg(r.error!); })} aria-label={`Delete ${t.name}`}>
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
              <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)_auto] gap-2 items-end">
                <Field label="Name"><input name="name" placeholder="T9" required /></Field>
                <Field label="Seats"><input name="capacity" type="number" defaultValue={4} className="num" /></Field>
                <div className="col-span-2 sm:col-span-1"><Field label="Zone"><input name="zone" placeholder="AC hall" defaultValue="Main" /></Field></div>
                <Button className="col-span-2 sm:col-span-1" disabled={pending} aria-label="Add table"><Plus size={16} /><span className="sm:hidden">Add table</span></Button>
              </div>
            </form>
          </Section>
        </Card>
      )}

      {/* ═══════ ADVANCED ═══════ */}
      {tab === "attendance" && <AttendanceSettings owner={owner} phoneReady={phoneReady} initial={{ methods: restaurant.attendance_methods ?? ["manual", "qr"], lat: restaurant.attend_lat ?? null, lng: restaurant.attend_lng ?? null, radius: restaurant.attend_radius_m ?? 150 }} />}

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
                    else { setBoxToken(r.token!); copyText(r.token!); setMsg("Box token copied to clipboard."); }
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
                    start(async () => { const r = await removeDemoData(); setMsg("error" in r ? r.error! : "Demo channels removed."); });
                }}><Trash2 size={15} /> Remove demo channels</Button>
              </div>
            </Section>
          </Card>
        </div>
      )}
    </div>
  );
}
