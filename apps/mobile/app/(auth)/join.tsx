import { useState } from "react";
import { TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button, H1, Body } from "@/components/ui";
import { C, F } from "@/lib/theme";
import { inp } from "./login";

export default function Join() {
  const { session, refresh } = useAuth();
  const [f, setF] = useState({ code: "", name: "", email: "", pw: "" }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null);
    if (!session) { const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.pw }); if (error || !data.session) { setErr(error?.message ?? "Confirm your email, then sign in and join."); setBusy(false); return; } }
    const { error } = await supabase.rpc("join_restaurant", { p_code: f.code.trim().toUpperCase(), p_full_name: f.name });
    if (error) setErr(error.message); else await refresh();
    setBusy(false);
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.porcelain }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", padding: 24 }}>
        <H1>Join your team</H1><Body muted style={{ marginTop: 4, marginBottom: 24 }}>Enter the invite code from your manager.</Body>
        <TextInput placeholder="Invite code" autoCapitalize="characters" value={f.code} onChangeText={(v) => setF({ ...f, code: v })} style={[inp, { fontFamily: F.mono, letterSpacing: 3 }]} placeholderTextColor={C.steel} maxLength={8} />
        <TextInput placeholder="Your name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} style={inp} placeholderTextColor={C.steel} />
        {!session && <><TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} style={inp} placeholderTextColor={C.steel} />
          <TextInput placeholder="Password" secureTextEntry value={f.pw} onChangeText={(v) => setF({ ...f, pw: v })} style={inp} placeholderTextColor={C.steel} /></>}
        {err && <Body style={{ color: C.chili, marginBottom: 12 }}>{err}</Body>}
        <Button title={busy ? "Joining…" : "Join restaurant"} onPress={go} disabled={busy} />
        <Link href="/(auth)/login" style={{ marginTop: 20, fontFamily: F.sans, color: C.steel, textAlign: "center" }}>Already have an account? Sign in</Link>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
