import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { RecordView } from "./RecordView";
export const dynamic = "force-dynamic";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export const metadata = { title: "Business record", robots: { index: false, follow: false } };

export default async function RecordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const hint = (h.get("user-agent") ?? "").split(")")[0].slice(0, 90);
  const { data } = await anon().rpc("proof_open", { p_token: token, p_hint: hint });
  return <RecordView data={data as never} />;
}
