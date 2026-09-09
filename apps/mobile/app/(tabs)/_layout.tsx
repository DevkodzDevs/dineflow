import { Tabs } from "expo-router";
import { LayoutDashboard, ClipboardList, Flame, Activity, Ellipsis } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useAuth } from "@/lib/auth";
import { startQueue, onQueue } from "@/lib/queue";
import { modulesFor } from "@dineflow/shared";
import { C, F } from "@/lib/theme";

export default function TabsLayout() {
  const { profile, restaurant } = useAuth();
  const [q, setQ] = useState({ pending: 0, online: true, syncing: false, justSynced: 0, lastError: null as string | null });
  useEffect(() => { const stop = startQueue(); const un = onQueue(setQ); return () => { stop(); un(); }; }, []);
  const can = (k: string) => (profile && restaurant ? modulesFor(restaurant.property_type, profile.role, restaurant.enabled_modules, profile.allowed_modules).includes(k) : false);
  const Banner = !q.online || q.pending > 0 || q.justSynced > 0 ? (
    <View style={{ position: "absolute", bottom: 96, alignSelf: "center", zIndex: 20, backgroundColor: q.justSynced ? C.green2 : q.online ? C.label : C.bg3, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 12, color: q.justSynced ? C.green : q.online ? C.bg : C.label }}>
        {q.justSynced ? `Back online \u00b7 ${q.justSynced} sent` : q.syncing ? `Sending ${q.pending}\u2026` : q.online ? `${q.pending} to send` : `Offline${q.pending ? ` \u00b7 ${q.pending} waiting` : ""}`}
      </Text>
    </View>
  ) : null;

  return (
    <>
    {Banner}
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bezel }, tabBarActiveTintColor: C.tint, tabBarInactiveTintColor: C.label2, tabBarStyle: { position: "absolute", left: 12, right: 12, bottom: 12, height: 64, borderRadius: 26, backgroundColor: C.card, borderTopWidth: 0, borderWidth: 0.5, borderColor: C.line, paddingBottom: 8, paddingTop: 8, shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 }, tabBarLabelStyle: { fontFamily: F.display, fontSize: 11, letterSpacing: 0.6 }, tabBarItemStyle: { borderRadius: 18 } }}>
      <Tabs.Screen name="home" options={{ title: "Control", href: can("dashboard") ? undefined : null, tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={22} /> }} />
      <Tabs.Screen name="tables" options={{ title: "Orders", href: can("orders") ? undefined : null, tabBarIcon: ({ color }) => <ClipboardList color={color} size={22} /> }} />
      <Tabs.Screen name="kitchen" options={{ title: "Kitchen", href: can("kitchen") ? undefined : null, tabBarIcon: ({ color }) => <Flame color={color} size={22} /> }} />
      <Tabs.Screen name="pulse" options={{ title: "Pulse", href: can("pulse") ? undefined : null, tabBarIcon: ({ color }) => <Activity color={color} size={22} /> }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: ({ color }) => <Ellipsis color={color} size={22} /> }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="rooms" options={{ href: null }} />
      <Tabs.Screen name="pantry" options={{ href: null }} />
    </Tabs>
    </>
  );
}
