import type { Track, Ride } from "./actions";

/** What the owner sees from Connections → "See the customer's page" / "See the rider's page": a made-up order, nothing written. */
const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();
export const DEMO_TRACK: Track = {
  status: "on_the_way", mode: "delivery", ref: "DEMO42", items: [{ name: "Chicken biryani", qty: 2 }, { name: "Butter naan", qty: 3 }, { name: "Raita", qty: 1 }], total: 745, eta_min: 25,
  property: { name: "Your restaurant", phone: "9840000000" }, rider: { name: "Kumar", phone: "9840000001" }, position: { lat: 13.0604, lng: 80.2496, at: ago(1) },
  timeline: { placed: ago(28), picked_up: ago(6), delivered: null },
};
export const DEMO_RIDE: Ride = {
  status: "assigned", ref: "DEMO42", items: DEMO_TRACK.items, total: 745, prepaid: false,
  customer: { name: "Priya S", phone: "9840000002", address: "14, 2nd Cross Street, Besant Nagar, Chennai 600090" }, property: { name: "Your restaurant", phone: "9840000000" }, rider: "Kumar", eta_min: 25,
  located_at: null, picked_up_at: null, delivered_at: null,
};
