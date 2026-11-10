import { notFound } from "next/navigation";
import { PrepayClient } from "./PrepayClient";
import { prepayStatus } from "./actions";
export const dynamic = "force-dynamic";

/**
 * Where the storefront sends a guest to pay for a prepaid online order (0181). No login: the 32-hex token minted for this
 * one order is the key. The guest pays the dynamic UPI QR; the webhook settles it and the counter sees the order. The page
 * never holds a secret — only the order's total and whether it is paid yet.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await prepayStatus(token);
  return info ? { title: `${info.status === "paid" ? "Paid" : "Pay"} ₹${Number(info.total).toLocaleString("en-IN")} · ${info.name}`, robots: { index: false } } : { title: "Order not found" };
}

export default async function PrepayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await prepayStatus(token);
  if (!info) notFound();
  return <PrepayClient token={token} initial={info} gatewayReady={!!process.env.SUPABASE_SERVICE_ROLE_KEY} />;
}
