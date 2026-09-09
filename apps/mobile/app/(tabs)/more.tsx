import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { BedDouble, Boxes, ScanLine, Sun, Moon, MonitorSmartphone, LogOut, KeyRound, Info } from "lucide-react-native";
import { Linking } from "react-native";
import { Screen, Inset, Cell, Value } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { C, F, useTheme } from "@/lib/theme";
import { supabase } from "@/lib/supabase";

const TABS = ["home", "tables", "kitchen", "pulse", "more"];
/** Everything that isn't a tab, in the shape of the Settings app: grouped, scannable, one thumb. */
export default function More() {
  const router = useRouter(); const { profile, restaurant, membership } = useAuth(); const { mode, set } = useTheme();
  const tick = (m: typeof mode) => mode === m ? <Value tone="live">✓</Value> : undefined;
  return (
    <Screen tabs={TABS} title="More" subtitle={restaurant?.name ?? ""}>
      <Inset header="The house">
        <Cell first leading={<BedDouble size={20} color={C.label2} />} title="Rooms" detail="Occupancy, arrivals, keys" onPress={() => router.push("/(tabs)/rooms")} />
        <Cell leading={<Boxes size={20} color={C.label2} />} title="Pantry" detail="Stock, counts, what to reorder" onPress={() => router.push("/(tabs)/pantry")} />
        <Cell leading={<ScanLine size={20} color={C.label2} />} title="Scan" detail="Barcodes, badges, a photo of a bill" onPress={() => router.push("/(tabs)/scan")} />
      </Inset>
      <Inset header="Appearance" footer="Dark is the board. Light is a bright room. Follow device switches with the phone.">
        <Cell first leading={<Moon size={20} color={C.label2} />} title="Dark" onPress={() => set("dark")} trailing={tick("dark")} chevron={false} />
        <Cell leading={<Sun size={20} color={C.label2} />} title="Light" onPress={() => set("paper")} trailing={tick("paper")} chevron={false} />
        <Cell leading={<MonitorSmartphone size={20} color={C.label2} />} title="Follow device" onPress={() => set("system")} trailing={tick("system")} chevron={false} />
      </Inset>
      <Inset header="You">
        <Cell first leading={<View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.label, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.display, color: C.bg }}>{profile?.full_name?.[0] ?? "?"}</Text></View>} title={profile?.full_name ?? ""} detail={profile?.role ?? ""} />
        <Cell leading={<KeyRound size={20} color={C.label2} />} title="Membership" trailing={<Value tone="muted">{membership}</Value>} />
        <Cell leading={<LogOut size={20} color={C.red} />} title="Sign out" destructive chevron={false} onPress={() => { void supabase.auth.signOut(); }} />
      </Inset>
      <Inset header="DineFlow" footer="Version 21 · one system for restaurants, hotels and resorts · works online and off.">
        <Cell first leading={<Info size={20} color={C.label2} />} title="About DineFlow" detail="What it does, every section, the guides" onPress={() => { void Linking.openURL(`${process.env.EXPO_PUBLIC_WEB_URL ?? ""}/about`); }} />
      </Inset>
    </Screen>
  );
}
