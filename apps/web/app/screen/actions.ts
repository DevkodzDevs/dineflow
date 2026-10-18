"use server";
import { createClient } from "@supabase/supabase-js";
import type { Feed } from "./[key]/ScreenClient";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

/** What the TV shows now, for its key (0103 `screen_feed`); null when the key is wrong, rotated or the place is closed. */
export async function screenFeed(key: string): Promise<Feed | null> {
  const { data, error } = await anon().rpc("screen_feed", { p_key: key });
  if (error) return null; return (data ?? null) as Feed | null;
}
