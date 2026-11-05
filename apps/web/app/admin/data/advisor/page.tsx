import { createClient } from "@/lib/supabase/server";
import { collectFacts, findings, SUGGESTED } from "@/lib/backup/advisor";
import { aiEnabled } from "@/lib/ai";
import { AdvisorClient } from "./AdvisorClient";
export const metadata = { title: "Advisor · Data · Master control" };
export const dynamic = "force-dynamic";

/** Data → Advisor: the findings (rules, every visit) and a place to ask; the model answers when a key exists. */
export default async function AdvisorPage() {
  const s = await createClient();
  const facts = await collectFacts(s, { cron: Boolean(process.env.CRON_SECRET), serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) });
  return <AdvisorClient findings={findings(facts)} suggested={[...SUGGESTED]} ai={aiEnabled()} at={facts.at} />;
}
