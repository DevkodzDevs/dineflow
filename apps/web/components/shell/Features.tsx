"use client";
import { createContext, useContext, type ReactNode } from "react";
import { hasFeature } from "@dineflow/shared";

/**
 * The property's add-ons (0175), handed down once from the (app) layout so any client component can ask — the receipt
 * for its extras, the channel cards for their push buttons. Outside the layout (a legal page's sample receipt) there is no
 * provider and nothing is switched off: `hasFeature(null, …)` is true.
 */
const Ctx = createContext<readonly string[] | null>(null);
export function FeaturesProvider({ features, children }: { features: readonly string[]; children: ReactNode }) {
  return <Ctx.Provider value={features}>{children}</Ctx.Provider>;
}
export const useFeatures = () => useContext(Ctx);
/** Is this add-on on for the property this screen belongs to? */
export const useFeature = (key: string) => hasFeature(useContext(Ctx), key);
