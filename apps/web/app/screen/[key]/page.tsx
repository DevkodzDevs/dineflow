import { notFound } from "next/navigation";
import { screenFeed } from "../actions";
import { ScreenClient, type Show } from "./ScreenClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Screen", robots: { index: false, follow: false } };

/** A TV by the counter (Settings → Screens & feedback): the menu, the parcel tokens, or both side by side.
 *  The key in the link is the only thing that opens it; rotating it in Settings switches off every old screen. */
export default async function ScreenPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ show?: string }> }) {
  const { key } = await params; const { show } = await searchParams;
  const feed = await screenFeed(key);
  if (!feed) notFound();
  const mode: Show = show === "menu" || show === "tokens" ? show : "both";
  return <ScreenClient k={key} initial={feed} show={mode} />;
}
