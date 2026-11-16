import { site } from "./data";
import { siteCard, size as cardSize, cardType } from "./card";

/** The share card of a property's website — drawn by card.tsx from the same read as the page. */
export const alt = "Website preview";
export const size = cardSize;
export const contentType = cardType;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return siteCard(await site(slug));
}
