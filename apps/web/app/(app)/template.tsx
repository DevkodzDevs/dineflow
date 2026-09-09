"use client";
import { motion } from "framer-motion";
import { pageV } from "@/lib/motion";
/** Every screen is a card in the deck: it slides in from the right and settles. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <motion.div variants={pageV} initial="hidden" animate="show" style={{ transformOrigin: "left center" }}>{children}</motion.div>;
}
