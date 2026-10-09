/**
 * schema.org data for a property's public page, so Google Search and Maps can read what the page
 * is — a restaurant, its cuisine, address, hours, price for two, rating — and which links reserve a
 * table and order food. Only what the public page already shows goes in. Fields the property has
 * not filled are left out rather than sent empty.
 */
export type StoreFacts = {
  name: string; tagline?: string | null; cuisines?: string[] | null; price_for_two?: number | null;
  rating?: number | null; rating_count?: number | null; address?: string | null; phone?: string | null;
  photos?: string[] | null; opens_at?: string | null; closes_at?: string | null;
  dining?: boolean; delivery?: boolean; takeaway?: boolean;
};

export function restaurantLd(d: StoreFacts, url: string): Record<string, unknown> {
  const ld: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Restaurant", name: d.name, url };
  if (d.tagline) ld.description = d.tagline;
  if (d.cuisines?.length) ld.servesCuisine = d.cuisines;
  if (d.address) ld.address = { "@type": "PostalAddress", streetAddress: d.address, addressCountry: "IN" };
  if (d.phone) ld.telephone = d.phone;
  if (d.photos?.length) ld.image = d.photos.slice(0, 5);
  if (d.price_for_two) ld.priceRange = `₹${Math.round(d.price_for_two)} for two`;
  if (d.opens_at && d.closes_at) ld.openingHours = `Mo-Su ${d.opens_at.slice(0, 5)}-${d.closes_at.slice(0, 5)}`;
  if (d.rating && d.rating_count) ld.aggregateRating = { "@type": "AggregateRating", ratingValue: Number(d.rating), reviewCount: d.rating_count };
  const ordering = !!(d.delivery || d.takeaway);
  ld.acceptsReservations = d.dining ? `${url}?tab=book` : false;
  if (ordering) ld.hasMenu = `${url}?tab=order`;
  const actions: Record<string, unknown>[] = [];
  if (d.dining) actions.push({ "@type": "ReserveAction", target: { "@type": "EntryPoint", urlTemplate: `${url}?tab=book`, actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] }, result: { "@type": "FoodEstablishmentReservation", name: `Table at ${d.name}` } });
  if (ordering) actions.push({ "@type": "OrderAction", target: { "@type": "EntryPoint", urlTemplate: `${url}?tab=order`, actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] }, deliveryMethod: [...(d.delivery ? ["http://purl.org/goodrelations/v1#DeliveryModeOwnFleet"] : []), ...(d.takeaway ? ["http://purl.org/goodrelations/v1#DeliveryModePickUp"] : [])] });
  if (actions.length) ld.potentialAction = actions;
  return ld;
}

/** JSON for a <script type="application/ld+json">, safe inside HTML: no "</script>" can close it early. */
export const ldJson = (ld: unknown) => JSON.stringify(ld).replace(/</g, "\\u003c");
