import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { collectFacts, findings, advise } from "@/lib/backup/advisor";

/** Master control → Data → Advisor (0173). POST { question } — master only. Reads only; answers with the model when a key
 *  exists, from the rules otherwise; every step is a link to a screen, never an action. */
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in as Master control." }, { status: 401 });
  const { data: isMaster } = await db.rpc("is_master");
  if (!isMaster) return NextResponse.json({ error: "Master control only." }, { status: 403 });
  let body: { question?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 400) : "";
  try {
    const facts = await collectFacts(db, { cron: Boolean(process.env.CRON_SECRET), serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) });
    const found = findings(facts);
    if (!question) return NextResponse.json({ findings: found, ai: facts.env.ai });
    const reply = await advise(question, facts, found);
    return NextResponse.json({ findings: found, reply, ai: facts.env.ai });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "The advisor could not read the data." }, { status: 500 });
  }
}
