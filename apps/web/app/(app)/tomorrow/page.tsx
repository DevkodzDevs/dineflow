import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Empty } from "@/components/ui";
import { TomorrowClient } from "./TomorrowClient";
export const metadata = { title: "Tomorrow" };
export const dynamic = "force-dynamic";

export default async function Tomorrow({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const s = await createClient(); const session = await requireSession();
  const target = date ?? new Date(Date.now() + 86400000 + 5.5 * 3600e3).toISOString().slice(0, 10);
  await s.rpc("grade_forecasts");
  const [{ data: forecast, error: failed }, { data: score }, { data: saved }] = await Promise.all([
    s.rpc("forecast_day", { p_date: target }),
    s.rpc("forecast_scorecard", { p_days: 30 }),
    s.from("forecast_runs").select("*").eq("for_date", target).maybeSingle(),
  ]);

  // The brief IS the forecast — there is nothing to scale, print or send without one. Say so on the
  // page instead of handing null to the client, which reads forecast.predicted_covers and throws.
  if (!forecast) {
    const nobody = failed?.message === "not signed in";   // the only branch in forecast_day that fires when no property resolves
    if (failed) console.error(`[tomorrow] forecast_day failed for ${target}:`, failed.message);
    return (
      <>
        <PageHeader eyebrow="Before you lock up tonight" title="Tomorrow"
          sub={new Date(target).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} />
        <Empty
          title={nobody ? "No property open on this login" : "No brief for this day yet"}
          hint={nobody
            ? "Tomorrow's brief is built for one property, and this sign-in did not resolve to one. Open a property from Master control, then come back."
            : failed
              ? `Tomorrow's brief could not be built: ${failed.message}`
              : "Once a few days of orders are on the books, tomorrow's covers, prep list and shopping list appear here."}
          action={<Link href={nobody ? "/admin" : "/dashboard"}><Button variant="outline">{nobody ? "Go to master control" : "Back to today"}</Button></Link>}
        />
      </>
    );
  }

  return <TomorrowClient date={target} forecast={forecast as never}
    score={(score ?? { days: 0, accuracy: null, within_range: null, recent: [] }) as never}
    saved={saved as never} restaurant={session.restaurant as never} />;
}
