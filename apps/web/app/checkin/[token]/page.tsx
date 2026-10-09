import { createClient } from "@/lib/supabase/server";
import { CheckinClient, type View } from "./CheckinClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Check in", robots: { index: false } };

/** A guest's online check-in, by the token on their booking. `?kiosk=1` is the desk's tablet. */
export default async function Checkin({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ kiosk?: string }> }) {
  const { token } = await params; const { kiosk } = await searchParams;
  const s = await createClient();
  const { data } = await s.rpc("checkin_view", { p_token: token });
  return <CheckinClient token={token} initial={(data as View | null) ?? null} kiosk={kiosk === "1"} />;
}
