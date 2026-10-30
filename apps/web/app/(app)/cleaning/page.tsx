import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { seesFresh, deptOf } from "@/components/shell/sections";
import { isCleaner } from "@/lib/notify";
import { SvcHead } from "@/components/ui/Service";
import { CleaningClient, type Board } from "./CleaningClient";

export const metadata = { title: "Cleaning" };
export const dynamic = "force-dynamic";

/** Every table paid and left and every room checked out, as a job with a name on it (0111): who it was given to and
 *  by whom, who took it and when, who finished it and how long it took. `clean_board` reads it all in one call. */
export default async function CleaningPage() {
  const session = await requireSession();
  // the people who turn tables and rooms round — service, housekeeping, front office — and whoever gives the jobs out
  // (2026-10-20: not a chef, a guard or a gardener; sections.ts seesFresh, the link asks the same). Work is open to all.
  if (!seesFresh("cleaning", session.profile.role, deptOf(session.profile.role, session.profile.department ?? null, session.profile.position ?? null))) redirect("/work");
  const s = await createClient();
  const { data, error } = await s.rpc("clean_board");
  const board = (data ?? { jobs: [], people: [], can_assign: false, tables_on: true }) as Board;
  return (
    <>
      <SvcHead icon="cleaning" title="Cleaning" sub="Tables and rooms" />
      <CleaningClient board={board} error={error?.message ?? null} me={session.profile.id} role={session.profile.role}
        canSet={["owner", "manager"].includes(session.profile.role)} hasRooms={session.restaurant.property_type !== "restaurant"}
        cleaner={isCleaner(session.profile.role, session.profile.department ?? null, session.profile.position ?? null)} />
    </>
  );
}
