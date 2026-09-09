import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { ProofClient } from "./ProofClient";
export const metadata = { title: "Proof of business" };
export const dynamic = "force-dynamic";

export default async function Proof() {
  const s = await createClient(); const session = await requireSession();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const [{ data: record }, { data: links }] = await Promise.all([
    s.rpc("business_record"),
    s.rpc("proof_links_list"),
  ]);
  return <ProofClient base={base} record={record as never} links={(links ?? []) as never} restaurant={session.restaurant as never} />;
}
