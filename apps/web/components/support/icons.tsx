import { Bug, MessageSquareWarning, CircleHelp, Lightbulb, CreditCard, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Kind } from "@/lib/support";

/** the icon for each kind of request — looked up on the client by key (lib/support.ts holds the words) */
export const KIND_ICON: Record<Kind, LucideIcon> = {
  problem: Bug, complaint: MessageSquareWarning, question: CircleHelp, idea: Lightbulb, billing: CreditCard, privacy: ShieldCheck,
};
export const kindIcon = (k: string): LucideIcon => KIND_ICON[k as Kind] ?? CircleHelp;
