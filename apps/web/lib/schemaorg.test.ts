import { describe, it, expect } from "vitest";
import { restaurantLd, ldJson } from "./schemaorg";

const URL_ = "https://dineflow.cloud/dine/manoooo";

describe("restaurantLd", () => {
  it("describes a restaurant that takes bookings and orders", () => {
    const ld = restaurantLd({ name: "manoooo", cuisines: ["South Indian"], price_for_two: 700, rating: 4.4, rating_count: 12, address: "14 Bazaar Street", phone: "+91 98430 22118", opens_at: "11:00:00", closes_at: "23:00:00", dining: true, delivery: true, takeaway: false }, URL_);
    expect(ld).toMatchObject({ "@type": "Restaurant", name: "manoooo", priceRange: "₹700 for two", openingHours: "Mo-Su 11:00-23:00", acceptsReservations: `${URL_}?tab=book`, hasMenu: `${URL_}?tab=order` });
    expect((ld.potentialAction as { "@type": string }[]).map((a) => a["@type"])).toEqual(["ReserveAction", "OrderAction"]);
  });
  it("leaves out what the property has not filled, and says no to reservations it does not take", () => {
    const ld = restaurantLd({ name: "Tanvi's" }, URL_);
    expect(ld).not.toHaveProperty("address");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("potentialAction");
    expect(ld.acceptsReservations).toBe(false);
  });
  it("cannot close its own script tag", () => {
    expect(ldJson({ name: "</script><b>" })).not.toContain("</script>");
  });
});
