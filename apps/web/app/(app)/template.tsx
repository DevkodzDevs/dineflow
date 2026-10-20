/** Every screen is a card in the deck: it slides in from the right and settles. A CSS animation (df-page in
 *  globals.css — the same 12px / 160 ms as pageV), not a motion component: the browser runs it without the page's
 *  JavaScript, so a tap's new screen starts drawing sooner on a phone (2026-10-20). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="df-page" style={{ transformOrigin: "left center" }}>{children}</div>;
}
