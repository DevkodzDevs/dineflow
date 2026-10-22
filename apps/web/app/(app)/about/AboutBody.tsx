import { PageHeader } from "@/components/shell/PageHeader";
import { Flip } from "@/components/ui";
import { MODULE_GROUPS } from "@dineflow/shared";
const VERSION = "21.0";
/** The whole product, in one page: what it is, what each section does, how it keeps its promises, and where the guides are. */
export function AboutBody() {
  return (
    <div>
      <PageHeader eyebrow={`Version ${VERSION}`} title="About" accent="DineFlow" sub="One app for your restaurant, hotel or resort." />
      <div className="flip-row mb-10"><Flip value={20} label="migrations" /><Flip value={24} label="sections" /><Flip value={8} label="test harnesses" tone="live" /><Flip value="0%" label="commission" /></div>

      <section className="grid lg:grid-cols-2 gap-6 mb-10">
        <div className="feather p-6"><div className="card-title"><h3>What it does</h3></div>
          <p className="text-[15px] leading-relaxed text-[var(--color-label-2)]">Waiters order by phone; the kitchen sees it at once. Guests order online, no commission.</p>
          <p className="text-[15px] leading-relaxed text-[var(--color-label-2)] mt-3">Works offline too. It sends everything once the internet is back.</p></div>
        <div className="feather p-6"><div className="card-title"><h3>Who sees what</h3></div>
          <div className="group">{[["Master", "All properties and what each one has"], ["Owner", "Their property, staff and who opens what"], ["Employee", "Only their own sections"]].map(([w, d]) => <div key={w} className="row"><span className="font-display text-lg w-24">{w}</span><span className="flex-1 text-[14px] text-[var(--color-label-2)]">{d}</span></div>)}</div>
          <p className="text-[13px] text-[var(--color-label-3)] mt-3">No one can give more access than they have.</p></div>
      </section>

      <section className="mb-10"><div className="card-title"><h2 className="text-2xl">Every section</h2></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{MODULE_GROUPS.map((g) => <div key={g.title} className="feather p-5"><div className="eyebrow mb-3">{g.title}</div><div className="stack !space-y-2">{g.keys.map((k) => <div key={k.key} className="flex items-baseline gap-3"><span className="text-[15px] font-semibold w-40 shrink-0">{k.label}</span><span className="text-[13px] text-[var(--color-label-2)]">{k.hint}</span></div>)}</div></div>)}</div>
      </section>

      <section className="grid lg:grid-cols-3 gap-4 mb-10">
        {[["Pulse", "Real wait times, and a walk-in queue guests join by QR."], ["Tomorrow's brief", "Tomorrow's guests, prep and shopping list, guessed from past days."], ["Leak finder", "Stock you should have vs stock you counted, in rupees."], ["Neighbours", "5+ local places share prices and spare stock. No one's figures shown alone."], ["Proof of business", "Each month's figures sealed. Share a link with your bank."], ["Assist", "Ask questions in plain words. It acts only after you tap Confirm."]].map(([t, d]) => <div key={t} className="feather p-5"><div className="font-display text-xl mb-1.5">{t}</div><p className="text-[14px] leading-relaxed text-[var(--color-label-2)]">{d}</p></div>)}
      </section>

      <section className="grid lg:grid-cols-2 gap-6 mb-10">
        <div className="feather p-6"><div className="card-title"><h3>How it keeps its promises</h3></div>
          <ul className="space-y-2.5 text-[14px] text-[var(--color-label-2)]">{["All 20 database changes are tested on a real database first.", "8 test sets check stock, GST maths, double-booking and access.", "An order or payment resent after a dropped line counts once.", "The database itself decides what each person can see.", "Every link and button is checked before release."].map((l) => <li key={l} className="flex gap-2.5"><span className="text-[var(--color-tint)] shrink-0">✓</span>{l}</li>)}</ul></div>
        <div className="feather p-6"><div className="card-title"><h3>Guides</h3></div>
          <div className="group">{[["STARTUP-GUIDE.md", "From a blank computer to a running property"], ["CONNECTIONS-GUIDE.md", "Every database and outside connection, key by key"], ["TEST-GUIDE.md", "A one-hour test, step by step"], ["BEGINNER-GUIDE.md", "The same in plain words"], ["SETUP-GUIDE.md", "Architecture and the full changelog"]].map(([f, d]) => <div key={f} className="row"><span className="num text-[13px] w-56">{f}</span><span className="flex-1 text-[13px] text-[var(--color-label-2)]">{d}</span></div>)}</div>
          <p className="text-[13px] text-[var(--color-label-3)] mt-3">All are in your DineFlow folder.</p></div>
      </section>

      <section className="feather p-6"><div className="card-title"><h3>Not built, on purpose</h3></div>
        <p className="text-[14px] leading-relaxed text-[var(--color-label-2)]">Payments: your Razorpay keys, or cash, UPI and card · Swiggy/Zomato: via UrbanPiper · OTAs: two-way iCal · WhatsApp: the Share button.</p>
        <p className="text-[12px] text-[var(--color-label-3)] mt-4">Built for Tamil Nadu · web, Android, iOS · works offline.</p></section>
    </div>
  );
}
