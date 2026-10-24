import type { Metadata } from "next";
import { riderView } from "../../track/actions";
import { DEMO_RIDE } from "../../track/demo";
import { RideClient } from "./RideClient";
export const metadata: Metadata = { title: "Your delivery", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The rider's page (0140): public, by the rider's own token. Picked up, Share my location, Delivered. `demo` writes nothing. */
export default async function RidePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token === "demo") return <RideClient token="demo" initial={DEMO_RIDE} demo />;
  const r = await riderView(token);
  return <RideClient token={token} initial={("ride" in r && r.ride) || null} />;
}
