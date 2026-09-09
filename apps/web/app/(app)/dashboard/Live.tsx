"use client";
import { motion } from "framer-motion";
import { useLive } from "@/lib/useLive";
/** Re-renders the control room whenever orders, kitchen, rooms or stock change — coalesced, never a storm. */
export function Live({ children }: { children: React.ReactNode }) {
  useLive(["orders", "order_items", "kots", "ingredients", "bills", "rooms", "bookings", "housekeeping_tasks", "online_orders"]);
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>{children}</motion.div>;
}
