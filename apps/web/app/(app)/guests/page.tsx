import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { Empty } from "@/components/ui";
import { GuestsClient, type Guest } from "./GuestsClient";

export const metadata = { title: "Guests" };
export const dynamic = "force-dynamic";

export default async function Guests({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const s = await createClient();
  // Every stay comes with the row, because tapping a guest opens all of them and a second trip to
  // Mumbai after the tap is the difference between a sheet that is there and one that arrives.
  let query = s
    .from("guests")
    .select("*, bookings(id, booking_no, check_in, check_out, status, rate, rooms(number))")
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("full_name", `%${q}%`);
  // the session travels with the rows, not in front of them: one trip, not two
  const [, { data: guests }] = await Promise.all([requireSession(), query]);

  return (
    <>
      <PageHeader eyebrow="Who stays with you" title="Guest" accent="book"
        actions={<form><input name="q" defaultValue={q} placeholder="Search by name" className="!w-56" /></form>} />
      {!guests?.length
        ? <Empty title={q ? "Nobody by that name" : "No guests yet"} hint={q ? "Try part of the name, or clear the search." : "Guests are created with their first booking at the front desk."} />
        : <GuestsClient guests={guests as unknown as Guest[]} />}
    </>
  );
}
