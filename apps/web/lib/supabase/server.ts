import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { cache } from "react";
/** One client per request, shared by every server component that asks. */
export const createClient = cache(async function createClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all: { name: string; value: string; options?: Record<string, unknown> }[]) => { try { all.forEach(({ name, value, options }) => store.set(name, value, options as never)); } catch { /* server components cannot set cookies; middleware does */ } },
    },
  });
});
