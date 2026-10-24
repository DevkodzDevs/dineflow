import type { Metadata } from "next";
import { trackOrder } from "../actions";
import { DEMO_TRACK } from "../demo";
import { TrackClient } from "./TrackClient";
export const metadata: Metadata = { title: "Track your order", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The customer's tracking page (0140): public, by the token in the link the restaurant sent. `demo` shows a made-up order. */
export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token === "demo") return <TrackClient token="demo" initial={DEMO_TRACK} demo />;
  const r = await trackOrder(token);
  return <TrackClient token={token} initial={("track" in r && r.track) || null} />;
}
