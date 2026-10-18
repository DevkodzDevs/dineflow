import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { SvcHead } from "@/components/ui/Service";
import { CleaningClient, type Board } from "./CleaningClient";

export const metadata = { title: "Cleaning" };
export const dynamic = "force-dynamic";

/** Every table paid and left and every room checked out, as a job with a name on it (0111): who it was given to and
 *  by whom, who took it and when, who finished it and how long it took. `clean_board` reads it all in one call. */
export default async function CleaningPage() {
  const session = await requireSession();
  const s = await createClient();
  const { data, error } = await s.rpc("clean_board");
  const board = (data ?? { jobs: [], people: [], can_assign: false, tables_on: true }) as Board;
  return (
    <>
      <SvcHead icon="cleaning" title="Cleaning" sub="A table after its guests leave, a room after check-out — take one, finish it, and your name goes on it" />
      <CleaningClient board={board} error={error?.message ?? null} me={session.profile.id} role={session.profile.role}
        canSet={["owner", "manager"].includes(session.profile.role)} hasRooms={session.restaurant.property_type !== "restaurant"} />
    </>
  );
}
