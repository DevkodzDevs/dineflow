import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { StorefrontSettings } from "./StorefrontSettings";
export const metadata = { title: "Storefront" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const s = await createClient(); const session = await requireSession(); const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  const { data: offers } = await s.from("offers").select("*").order("created_at", { ascending: false });
  return (<><PageHeader eyebrow="Your public page" title="Store" accent="front" sub="Where guests find you, book a table, and order in — with no commission to anyone." />
    <StorefrontSettings base={base} r={session.restaurant as never} offers={offers ?? []} /></>);
}
