import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { VoiceClient, type Item } from "./VoiceClient";

export const metadata = { title: "Feedback & complaints" };
export const dynamic = "force-dynamic";

/**
 * Feedback & complaints (0124) — the staff talking to their own owner, beside Help & support (the owner talking to
 * DineFlow). One route, two faces: everyone but the owner writes here and follows what they sent; the owner reads
 * every item of the property as an inbox and answers. RLS hands back exactly that — the owner every item, anyone
 * else their own — and an item sent without the name reaches the owner with no name, role or id on it at all.
 * Managers are staff here: a complaint may be about them, so they never see anyone else's.
 */
export default async function VoicePage() {
  const [session, s] = await Promise.all([requireSession(), createClient()]);
  const owner = session.profile.role === "owner";
  const { data } = await s.from("staff_voice")
    .select("id, kind, about, subject, body, anonymous, author_name, author_role, status, created_at, staff_at, owner_at, owner_seen_at, author_seen_at, resolved_at")
    .order("staff_at", { ascending: false }).limit(200);
  return (
    <>
      {owner
        ? <PageHeader eyebrow="From your team" title="Staff" accent="feedback"
            sub="From staff — only you see these" />
        : <PageHeader eyebrow="Straight to the owner" title="Feedback" accent="& complaints"
            sub="Only the owner reads it" />}
      <VoiceClient items={(data ?? []) as Item[]} owner={owner} name={session.profile.full_name} />
    </>
  );
}
