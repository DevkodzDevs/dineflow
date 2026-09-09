import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Role, PropertyType, Membership } from "@dineflow/shared";
import { supabase } from "./supabase";

type Profile = { id: string; full_name: string; role: Role; restaurant_id: string; allowed_modules: string[] | null };
type Rest = { id: string; name: string; gst_rate: number; service_charge_pct: number; property_type: PropertyType; trial_ends_at: string; membership_ends_at: string | null; enabled_modules: string[] | null };
type Ctx = { session: Session | null; profile: Profile | null; restaurant: Rest | null; membership: Membership | "none"; loading: boolean; refresh: () => Promise<void> };
const AuthCtx = createContext<Ctx>({ session: null, profile: null, restaurant: null, membership: "none", loading: true, refresh: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [restaurant, setRestaurant] = useState<Rest | null>(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<Membership | "none">("none");

  const load = async (s: Session | null) => {
    setSession(s);
    if (!s) { setProfile(null); setRestaurant(null); setLoading(false); return; }
    let { data: p } = await supabase.from("profiles").select("id, full_name, role, restaurant_id, allowed_modules").eq("id", s.user.id).maybeSingle();
    if (!p) {
      // master login: no profile of its own; act as the property chosen in Master control (web)
      const { data: acting } = await supabase.rpc("admin_acting_as");
      if (acting) p = { id: s.user.id, full_name: "Master", role: "owner", restaurant_id: acting as string } as never;
    }
    setProfile(p as Profile | null);
    if (p) { const [{ data: r }, { data: m }] = await Promise.all([supabase.from("restaurants").select("id, name, gst_rate, service_charge_pct, property_type, trial_ends_at, membership_ends_at, enabled_modules").eq("id", p.restaurant_id).single(), supabase.rpc("membership_state")]); setRestaurant(r as Rest); setMembership((m as Membership) ?? "expired"); }
    setLoading(false);
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => load(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return <AuthCtx.Provider value={{ session, profile, restaurant, membership, loading, refresh: async () => load((await supabase.auth.getSession()).data.session) }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
