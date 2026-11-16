// TEMPORARY probe fixture — the share card drawn for the made-up restaurant (photos and a logo on Wikimedia)
import { siteCard, size as cardSize, cardType } from "../[slug]/card";
import { pick } from "./fixture";
export const alt = "Website preview";
export const size = cardSize;
export const contentType = cardType;
export const dynamic = "force-dynamic";
export default async function Image() { return siteCard(pick({ kind: "restaurant", photo: "1", logo: "1" })); }
