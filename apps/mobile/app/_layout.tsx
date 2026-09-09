import { useEffect, useState, useMemo } from "react";
import { Appearance } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import { Manrope_500Medium, Manrope_700Bold } from "@expo-google-fonts/manrope";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PageLoader } from "@/components/ui";
import { C, ThemeContext, type ThemeMode, type Resolved, resolve, applyPalette, loadThemeMode, saveThemeMode } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { session, profile, membership, loading } = useAuth();
  const segments = useSegments(); const router = useRouter();
  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "(auth)";
    if (!session && !inAuth) router.replace("/(auth)/login");
    else if (session && !profile && (segments as string[])[1] !== "join") router.replace("/(auth)/join");
    else if (session && profile && (membership === "expired" || membership === "suspended") && segments[0] !== "locked") router.replace("/locked");
    else if (session && profile && inAuth) router.replace("/(tabs)/home");
  }, [session, profile, membership, loading, segments, router]);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bezel }, animation: "slide_from_right" }} />;
}

export default function Root() {
  const [ok] = useFonts({ Oswald: require("../assets/fonts/Oswald.ttf"), Manrope_500Medium, Manrope_700Bold, JetBrainsMono_500Medium });
  const [mode, setMode] = useState<ThemeMode | null>(null);
  const [resolved, setResolved] = useState<Resolved>("dark");
  useEffect(() => { loadThemeMode().then((m) => { const r = resolve(m); applyPalette(r); setResolved(r); setMode(m); }); }, []);
  useEffect(() => { const sub = Appearance.addChangeListener(() => { if (mode === "system") { const r = resolve("system"); applyPalette(r); setResolved(r); } }); return () => sub.remove(); }, [mode]);
  useEffect(() => { if (ok && mode) SplashScreen.hideAsync(); }, [ok, mode]);
  const theme = useMemo(() => ({ mode: mode ?? "dark", resolved, set: (m: ThemeMode) => { const r = resolve(m); applyPalette(r); setResolved(r); setMode(m); void saveThemeMode(m); } }), [mode, resolved]);
  if (!ok || !mode) return <PageLoader line="Opening DineFlow" />;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bezel }}>
      <ThemeContext.Provider value={theme}>
        {/* the key makes every screen re-read C after a switch */}
        <AuthProvider key={resolved}><StatusBar style={resolved === "paper" ? "dark" : "light"} /><Gate /></AuthProvider>
      </ThemeContext.Provider>
    </GestureHandlerRootView>
  );
}
