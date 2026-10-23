import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { SvcHead } from "@/components/ui/Service";
import { WorkClient, type WorkBoard } from "./WorkClient";

export const metadata = { title: "Work" };
export const dynamic = "force-dynamic";

/** Every job on the property (0113): the tables and rooms to clean, and everything anyone raises — a repair, a guest
 *  request, the grounds, a setup, a restock — routed to its department, with who took it, who finished it and when.
 *  `work_board` reads it all in one call. */
export default async function WorkPage() {
  const session = await requireSession();
  const s = await createClient();
  const { data, error } = await s.rpc("work_board");
  const board = (data ?? { jobs: [], work: [], people: [], labourers: [], cooks: [], rooms: [], tables: [], can_assign: false, tables_on: true, me_dept: null }) as WorkBoard;
  const dept = session.profile.department ?? board.me_dept ?? null;
  return (
    <>
      <SvcHead icon="work" title="Work" sub="Raise, take and finish jobs" />
      <WorkClient board={board} error={error?.message ?? null} me={session.profile.id} role={session.profile.role} dept={dept} hasRooms={session.restaurant.property_type !== "restaurant"} />
    </>
  );
}
