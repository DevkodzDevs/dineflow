"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Globe, Check, Copy, ExternalLink, Pencil, Lock, AlertTriangle, ArrowUpRight, UtensilsCrossed, Building2, TreePalm, Sparkles, Megaphone, CircleDashed, Search, Eye, Crown } from "lucide-react";
import { Button, Card, Sheet, Switch, cn } from "@/components/ui";
import { websiteChecklist, websitePath, websiteReach, websitePosts, websiteExtrasOn, isReviewUrl, websiteCan, websitePlanWith, websitePlanLabel, websitePlanPrice, WEBSITE_KIND, WEBSITE_EXTRAS, WEBSITE_LOOKS, WEBSITE_PLAN_FEATURES, WEBSITE_PLAN_ALWAYS, type WebsitePlanFeature, WEBSITE_LINK, WEBSITE_LINK_KEYS, WEBSITE_REACH_GROUP, type WebsiteSetup, type WebsiteCheck, type WebsiteSectionKey, type WebsiteLinkKey, type WebsiteLinks, type WebsiteReachItem, type WebsiteOptions, type WebsiteStats } from "@dineflow/shared";
import { QR } from "@/components/QR";
import { copyText } from "@/lib/clipboard";
import { saveWebsite } from "./actions";
import { WebsiteMedia } from "./WebsiteMedia";

/**
 * Settings → Website (0185, 2026-11-14 — the owner: "a Create website button; a checklist opens for that client's
 * restaurant, hotel or resort; from what is ticked, the website is made").
 *
 * The card says whether the property has a website and where it is. *Create website* opens the checklist: every section this
 * kind of property can have (packages/shared/src/website.ts), each one ready, empty or switched off — with the place to fix
 * it — and ticked by default when it is ready. Create saves the ticks (`website_save`, the owner only; the database checks)
 * and the website is live at /site/<slug>, drawn from the property's own menu, rooms and photos. Nothing is typed twice.
 *
 * Reach (2026-11-16, the owner: "what this kind of client needs for SEO, social media and digital marketing should be done
 * by itself"): the page writes its own title, search data, share card and sitemap entry; the card counts what the property
 * itself still has to give (a logo, a map pin, an Instagram link…) for its kind, with the screen that holds each, and
 * offers posts and hashtags to copy. The public email and the links are typed in the dialog and saved with the website.
 */
export type WebsiteProps = { setup: WebsiteSetup | null; available: boolean; base: string; stats?: WebsiteStats | null };

/** The count's line: what guests did, most telling first. */
const STAT: [string, string, string][] = [["view", "open", "opens"], ["order", "order tap", "order taps"], ["book", "room-booking tap", "room-booking taps"], ["reserve", "table tap", "table taps"], ["call", "call", "calls"], ["whatsapp", "WhatsApp tap", "WhatsApp taps"], ["directions", "directions", "directions"], ["enquiry", "enquiry", "enquiries"], ["review", "review tap", "review taps"], ["share", "share", "shares"]];

const KIND_ICON = { restaurant: UtensilsCrossed, hotel: Building2, resort: TreePalm } as const;
const HEADLINE_HINT = { restaurant: "Wood-fired dosas since 1998", hotel: "A quiet stay in the heart of the city", resort: "Wake up to the sea" } as const;

export function WebsiteCard({ setup, available, base, owner, stats = null }: WebsiteProps & { owner: boolean }) {
  /* what was just saved here, so the card is right the moment the dialog closes */
  const [saved, setSaved] = useState<WebsiteSetup["site"] | undefined>(undefined);
  const [slug, setSlug] = useState(setup?.slug ?? null);
  const [open, setOpen] = useState(false);
  const [reachOpen, setReachOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!available) return owner ? (
    <Card data-website-card data-website-unavailable>
      <Head />
      <p className="mt-3 rounded-xl px-3.5 py-2.5 text-[13.5px] bg-[var(--color-orange-2)] text-[var(--color-orange)] flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden /> Not on this database yet. It arrives with the next update.</p>
    </Card>
  ) : null;
  if (!setup || !setup.feature) return null;
  const site = saved === undefined ? setup.site : saved;
  const live = !!site?.published;
  const url = slug ? `${base}${websitePath(slug)}` : null;
  const copy = async () => { if (url && (await copyText(url))) { setCopied(true); setTimeout(() => setCopied(false), 1800); } };
  const now = { ...setup, slug, site: site ?? null };
  const reach = websiteReach(now), got = reach.filter((r) => r.done).length;

  return (
    <Card data-website-card data-website-state={site ? (live ? "live" : "hidden") : "none"}>
      <Head right={site ? <span className={cn("shrink-0 h-7 px-2.5 rounded-full grid place-items-center text-[11.5px] font-bold uppercase tracking-wide", live ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")} data-website-pill>{live ? "Live" : "Hidden"}</span> : null}
        sub={site ? `${site.sections.length} section${site.sections.length === 1 ? "" : "s"}${websiteExtrasOn(site.options) ? ` · ${websiteExtrasOn(site.options)} extra${websiteExtrasOn(site.options) === 1 ? "" : "s"}` : ""}` : `For your ${WEBSITE_KIND[setup.type].toLowerCase()}`} />
      {site && url ? (<>
        <div className="mt-4 rounded-2xl bg-[var(--color-fill)] px-4 py-3 text-[13.5px] font-semibold break-all" data-website-link>{url}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="svc-btn go sm !px-4" onClick={copy} data-website-copy><Copy size={16} aria-hidden /> {copied ? "Copied" : "Copy link"}</button>
          {live && <a href={url} target="_blank" rel="noreferrer" className="svc-btn quiet sm !px-4" data-website-open><ExternalLink size={16} aria-hidden /> Open</a>}
          {owner && <button type="button" className="svc-btn quiet sm !px-4" onClick={() => setOpen(true)} data-website-edit><Pencil size={16} aria-hidden /> Edit</button>}
        </div>
        {!live && <p className="mt-2 text-[12.5px] text-steel">Hidden from the public</p>}
        {/* how findable and shareable it is, for this kind of place */}
        <button type="button" onClick={() => setReachOpen(true)} className="mt-4 w-full min-h-[64px] rounded-2xl border border-[var(--color-separator)] px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--color-fill)] transition-colors" data-website-reach>
          <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-tint)]"><Megaphone size={18} aria-hidden /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-bold leading-tight">Search &amp; social</span>
            <span className="mt-1.5 block h-1.5 rounded-full bg-[var(--color-fill)] overflow-hidden" aria-hidden><span className="block h-full rounded-full bg-[var(--color-green)]" style={{ width: `${Math.round((got / reach.length) * 100)}%` }} /></span>
          </span>
          <span className="shrink-0 num text-[15px] font-extrabold" data-website-reach-score>{got}/{reach.length}</span>
        </button>
        {/* the visitor count, where the client switched it on: how many, never who */}
        {site.options?.stats && (
          <div className="mt-3 rounded-2xl border border-[var(--color-separator)] px-4 py-3 flex items-start gap-3" data-website-stats>
            <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-tint)]"><Eye size={18} aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold leading-tight">Last {stats?.days ?? 30} days</div>
              <p className="mt-1 text-[13.5px] text-steel leading-snug">{(() => { const t = stats?.total ?? {}; const said = STAT.filter(([k]) => (t[k] ?? 0) > 0).map(([k, one, many]) => `${new Intl.NumberFormat("en-IN").format(t[k]!)} ${t[k] === 1 ? one : many}`); return said.length ? said.join(" · ") : "No visits counted yet"; })()}</p>
            </div>
          </div>
        )}
        <ReachSheet open={reachOpen} onClose={() => setReachOpen(false)} rows={reach} setup={now} url={url} owner={owner} onEdit={() => { setReachOpen(false); setOpen(true); }} />
      </>) : owner ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => setOpen(true)} className="!h-12 !px-6 !rounded-full" data-website-create><Sparkles size={17} aria-hidden /> Create website</Button>
          <span className="text-[13px] text-steel">From your menu, rooms and photos</span>
        </div>
      ) : <p className="mt-4 text-[14px] text-steel flex items-center gap-2"><Lock size={15} aria-hidden /> Owner only.</p>}
      {/* the website plan this property is on (Master control assigns it): what it includes is open below, the rest is locked */}
      {(setup.plans?.length ?? 0) > 0 && (<>
        <button type="button" onClick={() => setPlansOpen(true)} className="mt-3 w-full min-h-[56px] rounded-2xl border border-[var(--color-separator)] px-4 py-2.5 flex items-center gap-3 text-left hover:bg-[var(--color-fill)] transition-colors" data-website-plan={setup.plan ?? "basic"}>
          <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-tint)]"><Crown size={18} aria-hidden /></span>
          <span className="flex-1 min-w-0"><span className="block text-[14.5px] font-bold leading-tight">{websitePlanLabel(setup)} plan</span><span className="block text-[12.5px] text-steel mt-0.5">{(setup.can ?? []).length} of {WEBSITE_PLAN_FEATURES.length} extras included</span></span>
          <span className="shrink-0 text-[13px] font-semibold text-[var(--color-tint)]">See plans</span>
        </button>
        <PlansSheet open={plansOpen} onClose={() => setPlansOpen(false)} setup={setup} />
      </>)}
      {owner && <WebsiteDialog open={open} onClose={() => setOpen(false)} setup={now} base={base}
        onSaved={(r, text) => { setSlug(r.slug); setSaved({ sections: r.sections, headline: text.headline || null, about: text.about || null, email: r.email ?? null, links: r.links ?? {}, options: r.options ?? {}, domain: r.domain ?? null, published: r.published, created_at: site?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }); }} />}
    </Card>
  );
}

function Head({ right, sub = "Your own public website" }: { right?: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)]"><Globe size={20} aria-hidden /></span>
      <div className="min-w-0 flex-1"><div className="text-[17px] font-extrabold">Website</div><p className="text-[13.5px] text-steel mt-0.5">{sub}</p></div>
      {right}
    </div>
  );
}

/** The four website plans side by side: the price, what each includes, which one this property is on. The plan is
 *  changed in Master control, so the sheet says who to ask rather than offering a button that cannot work. */
function PlansSheet({ open, onClose, setup }: { open: boolean; onClose: () => void; setup: WebsiteSetup }) {
  const mine = setup.plan ?? "basic";
  return (
    <Sheet open={open} onClose={onClose} title="Website plans" wide>
      <div data-website-plans>
        <div className="grid gap-3 sm:grid-cols-2">
          {(setup.plans ?? []).map((p) => (
            <div key={p.key} className={cn("rounded-2xl border-2 p-4 min-w-0", p.key === mine ? "border-[var(--color-tint)] bg-[var(--color-fill)]" : "border-[var(--color-separator)]")} data-website-plan-card={p.key} data-mine={p.key === mine ? "1" : "0"}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-[18px] font-extrabold leading-tight">{p.label}</div><div className="text-[13px] text-steel mt-0.5 num">{websitePlanPrice(p)}</div></div>
                {p.key === mine && <span className="shrink-0 h-7 px-2.5 rounded-full grid place-items-center text-[11.5px] font-bold uppercase tracking-wide bg-[var(--color-green-2)] text-[var(--color-green)]">Your plan</span>}</div>
              <ul className="mt-3 grid gap-1.5 text-[13.5px]">
                {WEBSITE_PLAN_FEATURES.map((f) => { const has = p.features.includes(f.key); return (
                  <li key={f.key} className={cn("flex items-center gap-2", !has && "text-[var(--color-label-3)]")} data-has={has ? "1" : "0"}>
                    {has ? <Check size={15} strokeWidth={3} className="shrink-0 text-[var(--color-green)]" aria-hidden /> : <Lock size={13} className="shrink-0" aria-hidden />}<span className="min-w-0">{f.label}</span><span className="sr-only">{has ? " — included" : " — not included"}</span>
                  </li>); })}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl bg-[var(--color-fill)] px-4 py-3 text-[13.5px] leading-snug"><b>Every plan has:</b> {WEBSITE_PLAN_ALWAYS.join(" · ")}.</p>
        <p className="mt-3 text-[13.5px] text-steel">To change your plan, ask DineFlow — <Link href="/help" className="font-semibold text-[var(--color-tint)] inline-flex items-center min-h-11">Help &amp; support</Link></p>
        <div className="mt-3 flex"><Button onClick={onClose} className="!h-12 flex-1">Done</Button></div>
      </div>
    </Sheet>
  );
}
/** An extra this plan does not include: its name, and the plan it starts in. Nothing to tap but the plans. */
function Locked({ feature, setup }: { feature: WebsitePlanFeature; setup: WebsiteSetup }) {
  const f = WEBSITE_PLAN_FEATURES.find((x) => x.key === feature)!, from = websitePlanWith(setup, feature);
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-separator)] px-4 py-3 flex items-center gap-3 min-h-[60px]" data-website-locked={feature}>
      <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold text-[var(--color-label-2)]">{f.label}</span><span className="block text-[12.5px] text-steel mt-0.5">{f.hint}</span></span>
      <span className="shrink-0 h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide bg-[var(--color-fill)] text-[var(--color-label-2)]"><Lock size={12} aria-hidden /> {from ?? "Not in a plan"}</span>
    </div>
  );
}

type Saved = { slug: string; sections: string[]; published: boolean; email: string | null; links: WebsiteLinks; options?: WebsiteOptions; domain?: string | null };

/** Reach: what the website does by itself, what the property still has to give for its kind, and posts to copy. */
function ReachSheet({ open, onClose, rows, setup, url, owner, onEdit }: { open: boolean; onClose: () => void; rows: WebsiteReachItem[]; setup: WebsiteSetup; url: string; owner: boolean; onEdit: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const kit = useMemo(() => websitePosts(setup, url), [setup, url]);
  const copy = async (key: string, text: string) => { if (await copyText(text)) { setCopied(key); setTimeout(() => setCopied(null), 1800); } };
  const got = rows.filter((r) => r.done).length;
  return (
    <Sheet open={open} onClose={onClose} title="Search & social" wide>
      <div data-website-reach-sheet={setup.type}>
        <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-fill)] px-4 py-3">
          <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-tint)]"><Search size={20} aria-hidden /></span>
          <div className="min-w-0 flex-1"><div className="text-[15.5px] font-extrabold truncate">{setup.name}</div><div className="text-[13px] text-steel">For a {WEBSITE_KIND[setup.type].toLowerCase()}</div></div>
          <span className="shrink-0 text-right"><span className="block num text-[20px] font-extrabold leading-none">{got}/{rows.length}</span><span className="block text-[11.5px] text-steel mt-1">ready</span></span>
        </div>
        {(Object.keys(WEBSITE_REACH_GROUP) as WebsiteReachItem["group"][]).map((g) => (
          <div key={g} className="mt-5" data-website-reach-group={g}>
            <div className="text-[12px] font-bold uppercase tracking-[.12em] text-steel">{WEBSITE_REACH_GROUP[g]}</div>
            <ul className="mt-2 rounded-2xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)] overflow-hidden" data-no-foot>
              {rows.filter((r) => r.group === g).map((r) => (
                <li key={r.key} className="flex items-stretch" data-website-reach-row={r.key} data-done={r.done ? "1" : "0"}>
                  <div className="flex-1 min-w-0 min-h-[56px] flex items-center gap-3 px-4 py-2.5">
                    <span aria-hidden className={cn("h-6 w-6 shrink-0 rounded-full grid place-items-center", r.done ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "text-[var(--color-orange)]")}>{r.done ? <Check size={15} strokeWidth={3} /> : <CircleDashed size={20} />}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 text-[15px] font-semibold leading-tight">{r.label}{r.auto && <span className="h-5 px-1.5 rounded-md inline-flex items-center text-[10.5px] font-bold uppercase tracking-wide bg-[var(--color-fill)] text-steel">Auto</span>}</span>
                      <span className={cn("block text-[12.5px] leading-snug mt-0.5 [overflow-wrap:anywhere]", r.done ? "text-steel" : "text-[var(--color-orange)]")}>{r.detail}</span>
                    </span>
                  </div>
                  {!r.done && (r.fix ? <Link href={r.fix.href} className="shrink-0 min-h-[56px] px-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-tint)] hover:bg-[var(--color-fill)]">{r.fix.label} <ArrowUpRight size={15} aria-hidden /></Link>
                    : owner ? <button type="button" onClick={onEdit} className="shrink-0 min-h-[56px] px-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-tint)] hover:bg-[var(--color-fill)]">Add <Pencil size={14} aria-hidden /></button> : null)}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {isReviewUrl(setup.site?.options?.review_url) && (
          <div className="mt-6 rounded-2xl border border-[var(--color-separator)] p-4 flex items-center gap-4" data-website-review-qr>
            <span className="shrink-0 rounded-xl bg-white p-2"><QR value={setup.site!.options!.review_url!} size={112} /></span>
            <div className="min-w-0"><div className="text-[15px] font-bold">Review us on Google</div><p className="mt-1 text-[13px] text-steel leading-snug">Guests scan this and rate you. Screenshot it for a table card or the bill counter.</p></div>
          </div>
        )}

        {/* posts to copy: nothing is posted for the owner — these are words to paste */}
        <div className="mt-6" data-website-posts>
          <div className="text-[12px] font-bold uppercase tracking-[.12em] text-steel">Ready posts</div>
          <div className="mt-2 grid gap-2.5">
            {kit.posts.map((p) => (
              <div key={p.title} className="rounded-2xl border border-[var(--color-separator)] p-4">
                <div className="flex items-center justify-between gap-3"><span className="text-[13px] font-bold">{p.title}</span>
                  <button type="button" className="svc-btn quiet sm !px-3.5" onClick={() => copy(p.title, `${p.text}${p.title === "WhatsApp status" ? "" : `\n\n${kit.tags.join(" ")}`}`)}><Copy size={15} aria-hidden /> {copied === p.title ? "Copied" : "Copy"}</button></div>
                <p className="mt-2 text-[14px] leading-snug whitespace-pre-line [overflow-wrap:anywhere]">{p.text}</p>
              </div>
            ))}
            <div className="rounded-2xl bg-[var(--color-fill)] p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-[13px] font-bold">Hashtags</span>
                <button type="button" className="svc-btn quiet sm !px-3.5" onClick={() => copy("tags", kit.tags.join(" "))}><Copy size={15} aria-hidden /> {copied === "tags" ? "Copied" : "Copy"}</button></div>
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-tint)] [overflow-wrap:anywhere]" data-website-tags>{kit.tags.join(" ")}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex gap-2.5">
          {owner && <Button variant="gray" onClick={onEdit} className="!h-12 shrink-0"><Pencil size={16} aria-hidden /> Edit website</Button>}
          <Button onClick={onClose} className="!h-12 flex-1 min-w-0">Done</Button>
        </div>
      </div>
    </Sheet>
  );
}

function WebsiteDialog({ open, onClose, setup, base, onSaved }: { open: boolean; onClose: () => void; setup: WebsiteSetup; base: string; onSaved: (r: Saved, text: { headline: string; about: string }) => void }) {
  const rows = useMemo(() => websiteChecklist(setup), [setup]);
  const editing = !!setup.site;
  const [ticks, setTicks] = useState<Set<WebsiteSectionKey>>(() => new Set(rows.filter((r) => r.ticked).map((r) => r.key)));
  const [headline, setHeadline] = useState(setup.site?.headline ?? "");
  const [about, setAbout] = useState(setup.site?.about ?? "");
  const [published, setPublished] = useState(setup.site?.published ?? true);
  const [email, setEmail] = useState(setup.site?.email ?? "");
  const [links, setLinks] = useState<Partial<Record<WebsiteLinkKey, string>>>(() => ({ ...(setup.site?.links ?? {}) }));
  /* the extras: off until the client switches them on */
  const [extras, setExtras] = useState(() => { const o = setup.site?.options ?? {}; return { review_url: o.review_url ?? "", enquiry: !!o.enquiry, banner_text: o.banner_text ?? "", banner_until: o.banner_until ?? "", offer_popup: !!o.offer_popup, stats: !!o.stats,
      look: (o.look ?? "night") as string, lang_ta: !!o.lang_ta, lang_hi: !!o.lang_hi, video_url: o.video_url ?? "", model_url: o.model_url ?? "", model_name: o.model_name ?? "", insta: [o.insta_1 ?? "", o.insta_2 ?? "", o.insta_3 ?? ""] }; });
  const [domain, setDomain] = useState(setup.site?.domain ?? "");
  const flip = (k: "enquiry" | "offer_popup" | "stats") => (on: boolean) => setExtras((x) => ({ ...x, [k]: on }));
  const can = (f: WebsitePlanFeature) => websiteCan(setup, f);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Saved | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const ready = rows.filter((r) => r.state === "ready").length;
  const KindIcon = KIND_ICON[setup.type] ?? UtensilsCrossed;
  const toggle = (k: WebsiteSectionKey) => setTicks((t) => { const n = new Set(t); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const chosen = rows.filter((r) => r.state === "ready" && ticks.has(r.key)).map((r) => r.key);
  const close = () => { setDone(null); setError(null); onClose(); };
  const save = () => {
    setError(null);
    start(async () => {
      const r = await saveWebsite(chosen, headline.trim(), about.trim(), published, email.trim(), links, extras, domain.trim());
      if ("error" in r) { setError(r.error ?? "Could not save the website."); return; }
      onSaved(r, { headline: headline.trim(), about: about.trim() }); setDone(r);
    });
  };
  const url = done ? `${base}${websitePath(done.slug)}` : "";
  const pages = rows.filter((r) => r.kind === "page"), buttons = rows.filter((r) => r.kind === "button");

  return (
    <Sheet open={open} onClose={close} title={done ? "Website ready" : editing ? "Edit website" : "Create website"} wide>
      {done ? (
        <div data-website-done className="text-center pt-2">
          <span className="mx-auto h-16 w-16 rounded-full grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]"><Check size={32} strokeWidth={2.6} aria-hidden /></span>
          <p className="mt-4 text-[22px] font-extrabold leading-tight">{done.published ? "Your website is live" : "Saved — hidden for now"}</p>
          <p className="mt-1 text-[14px] text-steel">{done.sections.length} section{done.sections.length === 1 ? "" : "s"} · changes show within half a minute</p>
          <div className="mt-5 rounded-2xl bg-[var(--color-fill)] px-4 py-3 text-[14px] font-semibold break-all text-left" data-website-done-link>{url}</div>
          <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2.5">
            <button type="button" className="btn btn-gray !h-12" onClick={async () => { if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1800); } }}><Copy size={16} aria-hidden /> {copied ? "Copied" : "Copy link"}</button>
            {done.published && <a href={url} target="_blank" rel="noreferrer" className="btn btn-gray !h-12 inline-flex items-center justify-center gap-2" data-website-done-open><ExternalLink size={16} aria-hidden /> Open</a>}
            <Button onClick={close} className="!h-12" data-website-done-close>Done</Button>
          </div>
        </div>
      ) : (
        <div data-website-dialog={setup.type}>
          {/* whose website, and how much of it is ready */}
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-fill)] px-4 py-3">
            <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-tint)]"><KindIcon size={20} aria-hidden /></span>
            <div className="min-w-0 flex-1"><div className="text-[15.5px] font-extrabold truncate">{setup.name}</div><div className="text-[13px] text-steel">{WEBSITE_KIND[setup.type]} website</div></div>
            <span className="shrink-0 text-right"><span className="block num text-[20px] font-extrabold leading-none" data-website-ready>{ready}/{rows.length}</span><span className="block text-[11.5px] text-steel mt-1">ready</span></span>
          </div>

          <List title="On the page" rows={pages} ticks={ticks} toggle={toggle} />
          {buttons.length > 0 && <List title="Buttons for guests" rows={buttons} ticks={ticks} toggle={toggle} />}

          <div className="mt-6 grid gap-4">
            <div className="space-y-1.5">
              <label htmlFor="ws-headline">Headline</label>
              <input id="ws-headline" value={headline} maxLength={120} onChange={(e) => setHeadline(e.target.value)} placeholder={HEADLINE_HINT[setup.type] ?? HEADLINE_HINT.restaurant} data-website-headline />
              <p className="footnote">One line under your name. Optional.</p>
            </div>
            {ticks.has("about") && (
              <div className="space-y-1.5">
                <label htmlFor="ws-about">About</label>
                <textarea id="ws-about" value={about} maxLength={1500} rows={4} onChange={(e) => setAbout(e.target.value)} placeholder="Who you are, what you are known for." data-website-about />
                <p className="footnote num">{about.length}/1500</p>
              </div>
            )}
            {/* how guests reach the place: shown on the page, the share card and the search data */}
            <div data-website-links>
              <div className="text-[12px] font-bold uppercase tracking-[.12em] text-steel">Contact &amp; social</div>
              <p className="footnote mt-1">Optional. Phone, address and logo come from Settings.</p>
              <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 min-w-0">
                  <label htmlFor="ws-email">Email for guests</label>
                  <input id="ws-email" type="email" inputMode="email" autoComplete="off" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} placeholder="hello@yourplace.in" data-website-email />
                </div>
                {WEBSITE_LINK_KEYS.map((k) => (
                  <div key={k} className="space-y-1.5 min-w-0">
                    <label htmlFor={`ws-${k}`}>{WEBSITE_LINK[k].label}</label>
                    <input id={`ws-${k}`} inputMode={k === "whatsapp" ? "tel" : "url"} autoComplete="off" autoCapitalize="none" spellCheck={false} value={links[k] ?? ""} maxLength={200}
                      onChange={(e) => setLinks((l) => ({ ...l, [k]: e.target.value }))} placeholder={WEBSITE_LINK[k].placeholder} data-website-link-input={k} />
                  </div>
                ))}
              </div>
            </div>
            <WebsiteMedia setup={setup} extras={{ video_url: extras.video_url, model_url: extras.model_url, model_name: extras.model_name }} onExtras={(patch) => setExtras((x) => ({ ...x, ...patch }))} />
            {/* the client's own choices: each is off, and costs the page nothing, until it is switched on */}
            <div data-website-extras>
              <div className="text-[12px] font-bold uppercase tracking-[.12em] text-steel">Extras</div>
              <p className="footnote mt-1">Your choice. Each is off until you switch it on. <span data-website-plan-note>On the {websitePlanLabel(setup)} plan.</span></p>
              <div className="mt-2.5 grid gap-2.5">
                {WEBSITE_EXTRAS.filter((x) => x.kind === "switch").map((x) => { const k = x.key as "enquiry" | "offer_popup" | "stats"; if (!can(k)) return <Locked key={k} feature={k} setup={setup} />; const need = k === "enquiry" && !(links.whatsapp ?? "").trim() ? "Needs your WhatsApp number, above" : k === "offer_popup" && setup.offers === 0 ? "Shows once you have an offer running" : x.hint; return (
                  <label key={k} className="card !p-4 flex items-center gap-3 cursor-pointer" data-website-extra={k}>
                    <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold">{x.label}</span><span className={cn("block text-[12.5px] mt-0.5", need === x.hint ? "text-steel" : "text-[var(--color-orange)]")}>{need}</span></span>
                    <Switch on={extras[k]} onChange={flip(k)} name={x.label} />
                  </label>
                ); })}
                {!can("review") ? <Locked feature="review" setup={setup} /> : (
                <div className="space-y-1.5 min-w-0" data-website-extra="review">
                  <label htmlFor="ws-review">Google review link</label>
                  <input id="ws-review" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} value={extras.review_url} maxLength={240} onChange={(e) => setExtras((x) => ({ ...x, review_url: e.target.value }))} placeholder="https://g.page/r/…/review" data-website-review />
                  <p className="footnote">Adds a “Review us on Google” button. Google Business Profile → Ask for reviews.</p>
                </div>)}
                {!can("banner") ? <Locked feature="banner" setup={setup} /> : (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]" data-website-extra="banner">
                  <div className="space-y-1.5 min-w-0">
                    <label htmlFor="ws-banner">Announcement</label>
                    <input id="ws-banner" value={extras.banner_text} maxLength={90} onChange={(e) => setExtras((x) => ({ ...x, banner_text: e.target.value }))} placeholder="Pongal special all this week" data-website-banner />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <label htmlFor="ws-banner-until">Show till</label>
                    <input id="ws-banner-until" type="date" className="num" value={extras.banner_until} onChange={(e) => setExtras((x) => ({ ...x, banner_until: e.target.value }))} data-website-banner-until />
                  </div>
                </div>)}
                {!can("look") ? <Locked feature="look" setup={setup} /> : (
                <div data-website-extra="look">
                  <div className="text-[14px] font-semibold" id="ws-look">Look</div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="ws-look">
                    {WEBSITE_LOOKS.map((l) => (
                      <button key={l.key} type="button" role="radio" aria-checked={extras.look === l.key} onClick={() => setExtras((x) => ({ ...x, look: l.key }))} data-website-look={l.key}
                        className={cn("min-h-[60px] rounded-2xl border-2 px-3 py-2 text-left transition-colors", extras.look === l.key ? "border-[var(--color-tint)] bg-[var(--color-fill)]" : "border-[var(--color-separator)]")}>
                        <span className="block text-[14.5px] font-bold">{l.label}</span><span className="block text-[11.5px] text-steel leading-tight mt-0.5">{l.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>)}
                {!can("lang") ? <Locked feature="lang" setup={setup} /> : (
                <div data-website-extra="lang">
                  <div className="text-[14px] font-semibold">Also in</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {([["lang_ta", "தமிழ்", "Tamil"], ["lang_hi", "हिन्दी", "Hindi"]] as const).map(([k, own, en]) => (
                      <label key={k} className="card !p-3.5 flex items-center gap-3 cursor-pointer" data-website-lang={k}>
                        <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold" translate="no">{own}</span><span className="block text-[12px] text-steel">{en}</span></span>
                        <Switch on={extras[k]} onChange={(on) => setExtras((x) => ({ ...x, [k]: on }))} name={en} />
                      </label>
                    ))}
                  </div>
                  <p className="footnote mt-1.5">Buttons and headings change. Your dish names and text stay as you typed them.</p>
                </div>)}
                {!can("insta") ? <Locked feature="insta" setup={setup} /> : (
                <div className="space-y-1.5" data-website-extra="insta">
                  <label htmlFor="ws-insta-1">Instagram posts</label>
                  {[0, 1, 2].map((i) => <input key={i} id={`ws-insta-${i + 1}`} aria-label={`Instagram post ${i + 1}`} inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} value={extras.insta[i]} maxLength={200}
                    onChange={(e) => setExtras((x) => ({ ...x, insta: x.insta.map((v, j) => (j === i ? e.target.value : v)) }))} placeholder="https://www.instagram.com/p/…" data-website-insta={i + 1} />)}
                  <p className="footnote">Up to three posts or reels. A post loads only when a guest taps it.</p>
                </div>)}
                {!can("domain") ? <Locked feature="domain" setup={setup} /> : (
                <div className="space-y-1.5" data-website-extra="domain">
                  <label htmlFor="ws-domain">Your own web address</label>
                  <input id="ws-domain" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} value={domain} maxLength={160} onChange={(e) => setDomain(e.target.value)} placeholder="www.yourplace.com" data-website-domain />
                  <p className="footnote">A domain you bought. After saving, DineFlow support connects it — it works once they confirm.</p>
                </div>)}
              </div>
            </div>
            {editing && (
              <label className="card !p-4 flex items-center gap-3 cursor-pointer" data-website-publish>
                <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold">Show to the public</span><span className="block text-[12.5px] text-steel mt-0.5">Off hides the website</span></span>
                <Switch on={published} onChange={setPublished} name="Show to the public" />
              </label>
            )}
          </div>

          {error && <p role="alert" className="mt-4 rounded-xl px-3.5 py-2.5 text-[13.5px] bg-[var(--color-red-2)] text-[var(--color-red)]" data-website-error>{error}</p>}
          <div className="mt-5 flex gap-2.5">
            <Button variant="gray" onClick={close} className="!h-12 shrink-0">Cancel</Button>
            <Button onClick={save} loading={pending} disabled={chosen.length === 0} className="!h-12 flex-1 min-w-0" data-website-save>{editing ? "Save website" : "Create website"}{chosen.length > 0 ? ` · ${chosen.length}` : ""}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** One group of the checklist. A ready row is a 60px tick target; a row that is not ready says why and where to fix it. */
function List({ title, rows, ticks, toggle }: { title: string; rows: WebsiteCheck[]; ticks: Set<WebsiteSectionKey>; toggle: (k: WebsiteSectionKey) => void }) {
  return (
    <div className="mt-5">
      <div className="text-[12px] font-bold uppercase tracking-[.12em] text-steel">{title}</div>
      <ul className="mt-2 rounded-2xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)] overflow-hidden" data-no-foot>
        {rows.map((r) => {
          const ok = r.state === "ready", on = ok && ticks.has(r.key);
          return (
            <li key={r.key} className="flex items-stretch" data-website-row={r.key} data-state={r.state} data-on={on ? "1" : "0"}>
              <button type="button" role="checkbox" aria-checked={on} aria-disabled={!ok} disabled={!ok} onClick={() => toggle(r.key)}
                className={cn("flex-1 min-w-0 min-h-[60px] flex items-center gap-3 px-4 py-2.5 text-left transition-colors", ok ? "hover:bg-[var(--color-fill)]" : "cursor-not-allowed")}>
                <span aria-hidden className={cn("h-6 w-6 shrink-0 rounded-[8px] grid place-items-center border-2 transition-colors",
                  on ? "bg-[var(--color-tint)] border-[var(--color-tint)] text-[var(--color-on-tint)]" : ok ? "border-[var(--color-label-3)]" : "border-[var(--color-separator)] bg-[var(--color-fill)]")}>{on && <Check size={15} strokeWidth={3} />}</span>
                <span className="flex-1 min-w-0">
                  <span className={cn("block text-[15px] font-semibold leading-tight", !ok && "text-[var(--color-label-2)]")}>{r.label}</span>
                  <span className={cn("block text-[12.5px] leading-snug mt-0.5", ok ? "text-[var(--color-green)]" : "text-[var(--color-orange)]")}>{r.detail}</span>
                </span>
              </button>
              {!ok && r.fix && <Link href={r.fix.href} className="shrink-0 min-h-[60px] px-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--color-tint)] hover:bg-[var(--color-fill)]" data-website-fix>{r.fix.label} <ArrowUpRight size={15} aria-hidden /></Link>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
