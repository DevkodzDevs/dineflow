import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { SupportDesk, type Row } from "./SupportDesk";

export const metadata = { title: "Support · Master control" };
export const dynamic = "force-dynamic";

/** Master control → Support: every request from every property (admin_support_list, master only),
 *  newest activity first. Filtering, the counters and search run in the page — a few hundred rows. */
export default async function SupportDeskPage() {
  await requireAdmin();
  const s = await createClient();
  const { data, error } = await s.rpc("admin_support_list", { p_limit: 500 });
  return <SupportDesk rows={(data ?? []) as Row[]} error={error?.message ?? null} />;
}
