import { useState } from "react";
import { View, TextInput, Text, KeyboardAvoidingView, Platform } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";
import { supabase } from "@/lib/supabase";
import { Button, Flip } from "@/components/ui";
import { C, F } from "@/lib/theme";
import { useEffect } from "react";

/** The wall on a phone: the live clock in three tiles, then the sign-in card. */
export default function Login() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const go = async () => { setBusy(true); setErr(null); const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw }); if (error) setErr(error.message); setBusy(false); };
  return (
    <View style={{ flex: 1, backgroundColor: C.bezel }}>
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <View style={{ paddingHorizontal: 24, paddingTop: 24, flex: 1, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", gap: 12, justifyContent: "center", marginBottom: 28 }}><Flip value={t.getHours()} pad={2} label="hour" size={92} /><Flip value={t.getMinutes()} pad={2} label="min" size={92} /><Flip value={t.getSeconds()} pad={2} label="sec" size={92} /></View>
          <Text style={{ fontFamily: F.display, fontSize: 34, lineHeight: 38, color: "#f4f4f1", textAlign: "center" }}>Every ticket, every room key,{"\n"}on one board.</Text>
        </View>
        <Animated.View entering={FadeInUp.duration(500)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 34, gap: 12 }}>
          <Text style={{ fontFamily: F.display, fontSize: 28, color: C.label }}>Welcome back</Text>
          <Text style={{ fontFamily: F.sans, fontSize: 14, color: C.label2, marginTop: -6, marginBottom: 6 }}>Sign in to your property.</Text>
          <TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} style={inp} placeholderTextColor={C.label3} />
          <TextInput placeholder="Password" secureTextEntry value={pw} onChangeText={setPw} style={inp} placeholderTextColor={C.label3} onSubmitEditing={go} />
          {err && <Text style={{ fontFamily: F.sans, color: C.red, fontSize: 13 }}>{err}</Text>}
          <Button title="Sign in" onPress={go} loading={busy} disabled={busy || !email || !pw} style={{ height: 52 }} />
          <Link href="/(auth)/join" style={{ marginTop: 8, fontFamily: F.sans, color: C.label2, textAlign: "center", fontSize: 14 }}>New staff? Join with an invite code</Link>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </View>
  );
}
export const inp = { backgroundColor: C.bg3, borderRadius: 14, paddingHorizontal: 14, height: 50, fontFamily: F.sans, fontSize: 16, color: C.label } as const;
