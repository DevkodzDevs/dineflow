import { PageHeader } from "@/components/shell/PageHeader";
import { Flip } from "@/components/ui";
import { MODULE_GROUPS } from "@dineflow/shared";
const VERSION = "21.0";
/** The whole product, in one page: what it is, what each section does, how it keeps its promises, and where the guides are. */
export function AboutBody() {
  return (
    <div>
      <PageHeader eyebrow={`Version ${VERSION}`} title="About" accent="DineFlow" sub="One system for a restaurant, a hotel or a resort: the floor, the kitchen, the rooms, the money, and the people, on one board." />
      <div className="flip-row mb-10"><Flip value={20} label="migrations" /><Flip value={24} label="sections" /><Flip value={8} label="test harnesses" tone="live" /><Flip value="0%" label="commission" /></div>

      <section className="grid lg:grid-cols-2 gap-6 mb-10">
        <div className="feather p-6"><div className="card-title"><h3>What it does</h3></div>
          <p className="text-[15px] leading-relaxed text-[var(--color-label-2)]">Waiters take orders on their phones and the kitchen sees them the same second. The front desk posts dinner to the room. Every dish sold takes its recipe out of the pantry. Guests book a table or order online from a page you own, at no commission. The owner sees the day's money on one board, and at close the till is reconciled in sixty seconds.</p>
          <p className="text-[15px] leading-relaxed text-[var(--color-label-2)] mt-3">It keeps working when the internet doesn't. Everything punched with no signal is stored on the device and sent when the line returns — exactly once.</p></div>
        <div className="feather p-6"><div className="card-title"><h3>Who sees what</h3></div>
          <div className="group">{[["Master", "Which properties exist, and what each property has"], ["Owner", "Everything the master allowed; who works here; what each employee can open"], ["Employee", "Only their own sections — nothing else exists for them"]].map(([w, d], i) => <div key={w} className="row"><span className="font-display text-lg w-24">{w}</span><span className="flex-1 text-[14px] text-[var(--color-label-2)]">{d}</span></div>)}</div>
          <p className="text-[13px] text-[var(--color-label-3)] mt-3">Each layer looks only down. Nobody can grant more than they hold; the last owner cannot lock themselves out.</p></div>
      </section>

      <section className="mb-10"><div className="card-title"><h2 className="text-2xl">Every section</h2></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{MODULE_GROUPS.map((g) => <div key={g.title} className="feather p-5"><div className="eyebrow mb-3">{g.title}</div><div className="stack !space-y-2">{g.keys.map((k) => <div key={k.key} className="flex items-baseline gap-3"><span className="text-[15px] font-semibold w-40 shrink-0">{k.label}</span><span className="text-[13px] text-[var(--color-label-2)]">{k.hint}</span></div>)}</div></div>)}</div>
      </section>

      <section className="grid lg:grid-cols-3 gap-4 mb-10">
        {[["Pulse", "Honest wait times learned from your own service, and a walk-in queue guests join by QR and watch from their phone."], ["Tomorrow's brief", "Tomorrow's covers, prep sheet and market list, predicted from comparable days and the bookings already in. It grades itself next day."], ["Leak finder", "What the recipes say you should have against what you counted, in rupees, item by item."], ["Neighbours", "Five or more places in your district share what they pay, what's going spare, and who can cover a shift. Nobody's figures are ever shown alone."], ["Proof of business", "Every month sealed with a fingerprint chained to the one before. Share a link with a bank; it verifies live. Edit a sealed figure and every later month says so."], ["Assist", "The tile in the corner. It reads the screen you're on and the whole house, answers in plain words, and only ever acts after you tap Confirm."]].map(([t, d]) => <div key={t} className="feather p-5"><div className="font-display text-xl mb-1.5">{t}</div><p className="text-[14px] leading-relaxed text-[var(--color-label-2)]">{d}</p></div>)}
      </section>

      <section className="grid lg:grid-cols-2 gap-6 mb-10">
        <div className="feather p-6"><div className="card-title"><h3>How it keeps its promises</h3></div>
          <ul className="space-y-2.5 text-[14px] text-[var(--color-label-2)]">{["Every one of the 20 database migrations is executed against a real PostgreSQL engine before it ships.", "Eight test harnesses prove tenancy, stock, GST maths, double-booking, chain tamper-detection, k-anonymity, replay safety and access rules.", "Resending an order or a payment after a dropped connection lands exactly once — the server de-duplicates by client id.", "Row Level Security in the database, not the app, decides what each signed-in person can see.", "Every link in both apps is checked against the routes that exist; every button against the functions that exist."].map((l) => <li key={l} className="flex gap-2.5"><span className="text-[var(--color-tint)] shrink-0">✓</span>{l}</li>)}</ul></div>
        <div className="feather p-6"><div className="card-title"><h3>Guides</h3></div>
          <div className="group">{[["STARTUP-GUIDE.md", "From an empty computer to a running property, thirty parts"], ["CONNECTIONS-GUIDE.md", "Every database and outside connection, key by key"], ["TEST-GUIDE.md", "A sixty-minute walk-through with what you should see"], ["BEGINNER-GUIDE.md", "The same in plain words"], ["SETUP-GUIDE.md", "Architecture and the full changelog"]].map(([f, d]) => <div key={f} className="row"><span className="num text-[13px] w-56">{f}</span><span className="flex-1 text-[13px] text-[var(--color-label-2)]">{d}</span></div>)}</div>
          <p className="text-[13px] text-[var(--color-label-3)] mt-3">All of them live in the DineFlow folder you were given.</p></div>
      </section>

      <section className="feather p-6"><div className="card-title"><h3>Not built, on purpose</h3></div>
        <p className="text-[14px] leading-relaxed text-[var(--color-label-2)]">A payment gateway (bills settle by cash, UPI QR, card machine or room folio) · direct Swiggy and Zomato partner APIs (they need partner approval; the webhook path through UrbanPiper works today) · real-time OTA APIs (they need certification; two-way iCal is built) · the WhatsApp Business API (the share sheet is free and works now). Each has a working substitute.</p>
        <p className="text-[12px] text-[var(--color-label-3)] mt-4">DineFlow · built for Tamil Nadu's restaurants, hotels and resorts · web, Android and iOS · works online and off.</p></section>
    </div>
  );
}
