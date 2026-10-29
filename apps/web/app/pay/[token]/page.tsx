import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PayClient, type PayInfo } from "./PayClient";
export const dynamic = "force-dynamic";

/** The page a guest lands on after scanning the QR on their bill. No login: the token on the bill is the key. */
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await anon().rpc("pay_link", { p_token: token });
  const d = data as PayInfo | null;
  return d ? { title: `${d.status === "paid" ? "Paid" : "Pay"} ₹${Number(d.total).toLocaleString("en-IN")} · ${d.restaurant.name}` } : { title: "Bill not found" };
}

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ from?: string }> }) {
  const { token } = await params;
  // 0148: a guest who came from their table's menu gets a way back to it — only a path on this site's /dine pages
  const from = (await searchParams).from;
  const back = from && /^\/dine\/[\w-]+(\?[\w=&%.-]*)?$/.test(from) ? from : null;
  const { data } = await anon().rpc("pay_link", { p_token: token });
  if (!data) notFound();
  // Card payments need the server to talk to the gateway with the property's keys, which it can only
  // read with the service role. Without it the page still works: UPI, and cards at the counter.
  return <PayClient token={token} initial={data as PayInfo} gatewayReady={!!process.env.SUPABASE_SERVICE_ROLE_KEY} back={back} />;
}
