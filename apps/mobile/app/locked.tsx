import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Crown } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button, H1, Body } from "@/components/ui";
import { C } from "@/lib/theme";

export default function Locked() {
  const { restaurant, membership, refresh } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.porcelain, justifyContent: "center", padding: 28 }}>
      <View style={{ height: 52, width: 52, borderRadius: 16, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", marginBottom: 16 }}><Crown color="#cdb07a" size={24} /></View>
      <H1>{membership === "suspended" ? "Account suspended" : "Trial ended"}</H1>
      <Body muted style={{ marginTop: 8, lineHeight: 20 }}>{membership === "suspended" ? "Contact DineFlow support to restore access." : `The 7-day trial for ${restaurant?.name} is over. The owner can activate membership from the web app (Settings → Membership) with the key issued by DineFlow. Your data is safe.`}</Body>
      <Text style={{ marginTop: 20, fontFamily: "JetBrainsMono_500Medium", color: C.steel, fontSize: 12 }}>app.dineflow.in/membership</Text>
      <Button title="I've activated — refresh" style={{ marginTop: 20 }} onPress={refresh} />
      <Button title="Sign out" variant="outline" style={{ marginTop: 10 }} onPress={() => supabase.auth.signOut()} />
    </SafeAreaView>
  );
}
