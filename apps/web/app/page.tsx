import { createClient } from "@supabase/supabase-js";
import { SiteHeader, SiteFooter } from "@/components/site/Site";
import { Landing, type PublicPlan } from "@/components/site/Landing";

/**
 * dineflow.cloud (2026-10-29, item 18). It used to send everyone to /login; now a stranger sees what DineFlow is. A signed-in
 * person and the Windows app (signed out) are still sent on by the middleware — to their screens, or to /login — before
 * this page is ever drawn. Static, refreshed every ten minutes (and at once when Master control saves a price), so it
 * opens fast; the prices are the plans' own (public_plans, 0152).
 */
export const revalidate = 600;
export const metadata = {
  title: "DineFlow — restaurant and hotel software for India",
  description: "Orders at the table and the till, a kitchen screen, bills with GST done right, rooms and housekeeping, staff and payroll — in English, Tamil and Hindi. 7 days free.",
};

export default async function Home() {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data } = await anon.rpc("public_plans");
  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <SiteHeader />
      <Landing plans={(data ?? []) as PublicPlan[]} />
      <SiteFooter />
    </div>
  );
}
