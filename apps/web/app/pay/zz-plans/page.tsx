// TEMPORARY probe harness — deleted before commit. Master control's two website-plan pieces on made-up plans (no sign-in, no database).
import { WebsitePlansCard, WebsitePlanPick } from "@/app/admin/WebsitePlans";
import { WEBSITE_PLAN_KEYS, WEBSITE_PLAN_DEFAULTS, type WebsitePlan } from "@dineflow/shared";

const PLANS: WebsitePlan[] = WEBSITE_PLAN_KEYS.map((key, i) => ({ key, label: WEBSITE_PLAN_DEFAULTS[key].label, price_month: i === 0 ? 0 : i === 3 ? null : 499 * i, price_year: i === 0 || i === 3 ? null : 4999 * i, features: [...WEBSITE_PLAN_DEFAULTS[key].features] }));
export default async function Harness({ searchParams }: { searchParams: Promise<{ on?: string }> }) {
  const q = await searchParams;
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="max-w-md"><WebsitePlanPick restaurantId="11111111-2222-3333-4444-555555555555" current={q.on ?? "standard"} plans={PLANS} /></div>
      <WebsitePlansCard plans={PLANS} />
    </main>
  );
}
