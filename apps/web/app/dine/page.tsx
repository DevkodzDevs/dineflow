import { createClient } from "@supabase/supabase-js";
import { DiscoverClient } from "./DiscoverClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Eat out · DineFlow", description: "Book a table, order in, or find a room near you." };
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export default async function Dine({ searchParams }: { searchParams: Promise<{ q?: string; city?: string; mode?: string }> }) {
  const { q, city, mode } = await searchParams;
  const { data } = await anon().rpc("dine_discover", { p_q: q || null, p_city: city || null, p_lat: null, p_lng: null, p_mode: mode || null });
  return <DiscoverClient initial={(data ?? []) as never} q={q ?? ""} city={city ?? ""} mode={mode ?? ""} />;
}
