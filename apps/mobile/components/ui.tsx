import { Pressable, Text, View, type ViewStyle, type PressableProps, Platform, Dimensions } from "react-native";
import { useEffect, useState, useRef } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useRouter, usePathname } from "expo-router";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay, runOnJS, Easing, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { C, F, R, FLIP, shadow, spring, useTheme } from "@/lib/theme";
import { Sun, Moon } from "lucide-react-native";

const AP = Animated.createAnimatedComponent(Pressable);

/** HIG button: filled (tint) · ink · gray · plain · danger. Presses scale with a spring and tick with haptics. */
export function Button({ title, variant = "primary", onPress, disabled, style, icon, loading }: { title: string; variant?: "primary" | "ink" | "outline" | "danger" | "gray" | "plain"; onPress?: () => void; disabled?: boolean; style?: ViewStyle; icon?: React.ReactNode; loading?: boolean } & PressableProps) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const v = variant === "outline" ? "gray" : variant;
  const bg = { primary: C.tint, ink: C.ink, gray: C.fill, plain: "transparent", danger: C.red2 }[v];
  const fg = { primary: C.onTint, ink: C.bg, gray: C.label, plain: C.tint, danger: C.red }[v];
  return (
    <AP onPressIn={() => { s.value = withSpring(0.96, spring); }} onPressOut={() => { s.value = withSpring(1, spring); }}
      onPress={(e) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.(e as never); }} disabled={disabled || loading}
      style={[a, { height: 48, paddingHorizontal: 20, borderRadius: 16, backgroundColor: bg, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: disabled ? 0.4 : 1 }, v === "primary" && { shadowColor: C.tint, shadowOpacity: .45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, style]}>
      {loading ? <Loader size={24} tone={undefined} /> : icon}<Text style={{ fontFamily: F.sansBold, fontWeight: "700", fontSize: 15, color: fg, letterSpacing: -0.2, opacity: loading ? 0.7 : 1 }}>{title}</Text>
    </AP>
  );
}

export function Card({ children, style, delay = 0 }: { children: React.ReactNode; style?: ViewStyle; delay?: number }) {
  return <Animated.View entering={FadeInDown.delay(delay).springify().damping(18)} style={[{ backgroundColor: C.card, borderRadius: R, padding: 16, borderWidth: 0.5, borderColor: C.line, ...shadow }, style]}>{children}</Animated.View>;
}

/** iOS inset grouped list */
export function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View>
      {title && <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.label2, paddingHorizontal: 16, paddingVertical: 6 }}>{title}</Text>}
      <View style={{ backgroundColor: C.card, borderRadius: R, borderWidth: 0.5, borderColor: C.line, overflow: "hidden", ...shadow }}>{children}</View>
    </View>
  );
}
export function Row({ label, detail, right, onPress, first }: { label: string; detail?: string; right?: React.ReactNode; onPress?: () => void; first?: boolean }) {
  return (
    <Pressable onPress={onPress ? () => { Haptics.selectionAsync(); onPress(); } : undefined} style={({ pressed }) => ({ backgroundColor: pressed ? C.fill : "transparent" })}>
      <View style={{ minHeight: 52, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: first ? 0 : 0.5, borderTopColor: C.line, marginLeft: first ? 0 : 0 }}>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: F.sans, fontSize: 16, color: C.label }}>{label}</Text>{detail && <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.label2 }}>{detail}</Text>}</View>
        {right}{onPress && <Text style={{ color: C.label3, fontSize: 18 }}>›</Text>}
      </View>
    </Pressable>
  );
}

/** Frosted bar (tab bar / headers) */
export function Material({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return Platform.OS === "ios"
    ? <BlurView intensity={50} tint={C.bg === "#f4f4f1" ? "light" : "dark"} style={[{ borderRadius: 26, overflow: "hidden", borderWidth: 0.5, borderColor: C.line }, style]}>{children}</BlurView>
    : <View style={[{ borderRadius: 26, overflow: "hidden", backgroundColor: C.card, borderWidth: 0.5, borderColor: C.line }, style]}>{children}</View>;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <View style={{ flexDirection: "row", padding: 3, borderRadius: 12, backgroundColor: C.fill }}>
      {options.map((o) => { const on = o.value === value; return (
        <Pressable key={o.value} onPress={() => { Haptics.selectionAsync(); onChange(o.value); }} style={{ flex: 1, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: on ? C.label : "transparent", ...(on ? { shadowColor: "#000", shadowOpacity: .12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : {}) }}>
          <Text style={{ fontFamily: F.sansBold, fontWeight: "600", fontSize: 13, color: on ? C.bg : C.label2 }}>{o.label}</Text></Pressable>); })}
    </View>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const x = useSharedValue(on ? 20 : 0);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); x.value = withSpring(on ? 0 : 20, spring); onChange(!on); }}
      style={{ width: 51, height: 31, borderRadius: 999, backgroundColor: on ? C.green : C.fill2, justifyContent: "center", padding: 2 }}>
      <Animated.View style={[a, { width: 27, height: 27, borderRadius: 999, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: .18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 }]} />
    </Pressable>
  );
}

export function Pill({ tone, label }: { tone: "pending" | "preparing" | "ready" | "served" | "alert"; label: string }) {
  const m = { pending: [C.fill, C.label2], preparing: ["rgba(255,179,64,0.18)", C.orange], ready: [C.green2, C.green], served: [C.fill, C.label3], alert: [C.red2, C.red] }[tone];
  return <View style={{ alignSelf: "flex-start", backgroundColor: m[0], borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><Text style={{ fontFamily: F.sansBold, fontWeight: "600", fontSize: 12, color: m[1] }}>{label}</Text></View>;
}
export function LargeTitle({ children }: { children: React.ReactNode }) { return <Text style={{ fontFamily: F.display, fontSize: 34, color: C.label, letterSpacing: 0.2, lineHeight: 38 }}>{children}</Text>; }
export function H1({ children }: { children: React.ReactNode }) { return <LargeTitle>{children}</LargeTitle>; }
export function Eyebrow({ children }: { children: React.ReactNode }) { return <Text style={{ fontFamily: F.display, fontSize: 13, color: C.label2, letterSpacing: 0.8 }}>{children}</Text>; }
export function Mono({ children, style }: { children: React.ReactNode; style?: object }) { return <Text style={[{ fontFamily: F.mono, color: C.label, fontVariant: ["tabular-nums"] }, style]}>{children}</Text>; }
export function Body({ children, muted, bold, style }: { children: React.ReactNode; muted?: boolean; bold?: boolean; style?: object }) { return <Text style={[{ fontFamily: bold ? F.sansBold : F.sans, fontWeight: bold ? "600" : "400", fontSize: 15, color: muted ? C.label2 : C.label, letterSpacing: -0.2 }, style]}>{children}</Text>; }

/* ═══ THE FLIP TILE ═══ one flap per character. When a character changes, the top half of the old one
   folds down onto the hinge and the bottom half of the new one falls the rest of the way — the way the
   board on the wall moves. 19 → 20 turns two flaps; 11 → 12 turns one. */
function Flap({ ch, size, colour, delay }: { ch: string; size: number; colour: string; delay: number }) {
  const [cur, setCur] = useState(ch); const [prev, setPrev] = useState<string | null>(null);
  const top = useSharedValue(0); const bottom = useSharedValue(90);
  useEffect(() => {
    if (ch === cur) return;
    setPrev(cur); setCur(ch); top.value = 0; bottom.value = 90;
    top.value = withDelay(delay, withTiming(-90, { duration: 280, easing: Easing.in(Easing.quad) }));
    bottom.value = withDelay(delay + 260, withTiming(0, { duration: 320, easing: Easing.out(Easing.back(1.6)) }, (done) => { if (done) runOnJS(setPrev)(null); }));
  }, [ch, cur, delay, top, bottom]);
  // one flap = two plates with a 2 px gap at the hinge; each plate is a card of its own
  // a flap is as wide as the character it carries: % and ₹ are wide, letters a little wider than digits, punctuation narrow
  const widest = prev && prev > ch ? prev : ch;
  const ratio = /[%₹]/.test(widest) ? 0.56 : /[MW]/.test(widest) ? 0.5 : /[A-Z]/.test(widest) ? 0.42 : /[:.\-–]/.test(widest) ? 0.2 : 0.36;
  const w = size * ratio, h = size * 0.66, fs = size * 0.62, half = h / 2 - 1, r = size * 0.06;
  const glyph = (c: string, plate: "top" | "bottom") => (
    <View style={{ position: "absolute", left: 0, right: 0, height: h, top: plate === "top" ? 0 : -(h - half), alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: F.display, fontSize: fs, lineHeight: h, color: colour, fontVariant: ["tabular-nums"] }}>{c}</Text>
    </View>
  );
  const plate = (which: "top" | "bottom"): ViewStyle => which === "top"
    ? { position: "absolute", left: 0, right: 0, top: 0, height: half, overflow: "hidden", backgroundColor: "#2e2f39", borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: 1, borderBottomRightRadius: 1, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.09)" }
    : { position: "absolute", left: 0, right: 0, bottom: 0, height: half, overflow: "hidden", backgroundColor: "#1b1c23", borderBottomLeftRadius: r, borderBottomRightRadius: r, borderTopLeftRadius: 1, borderTopRightRadius: 1, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.6)" };
  const topA = useAnimatedStyle(() => ({ transform: [{ perspective: 700 }, { translateY: half / 2 }, { rotateX: `${top.value}deg` }, { translateY: -half / 2 }], backfaceVisibility: "hidden", opacity: 1 }));
  const botA = useAnimatedStyle(() => ({ transform: [{ perspective: 700 }, { translateY: -half / 2 }, { rotateX: `${bottom.value}deg` }, { translateY: half / 2 }], backfaceVisibility: "hidden" }));
  const shadeTop = useAnimatedStyle(() => ({ opacity: Math.min(1, -top.value / 90) * 0.55 }));
  const shadeBot = useAnimatedStyle(() => ({ opacity: Math.min(1, bottom.value / 90) * 0.55 }));
  return (
    <View style={{ width: w, height: h }}>
      <View style={plate("top")}>{glyph(cur, "top")}</View>
      <View style={plate("bottom")}>{glyph(prev ?? cur, "bottom")}</View>
      {prev !== null && <Animated.View style={[plate("top"), topA, { zIndex: 3 }]}>{glyph(prev, "top")}<Animated.View pointerEvents="none" style={[{ position: "absolute", inset: 0, backgroundColor: "#000" } as ViewStyle, shadeTop]} /></Animated.View>}
      {prev !== null && <Animated.View style={[plate("bottom"), botA, { zIndex: 3 }]}>{glyph(cur, "bottom")}<Animated.View pointerEvents="none" style={[{ position: "absolute", inset: 0, backgroundColor: "#000" } as ViewStyle, shadeBot]} /></Animated.View>}
    </View>
  );
}
export function Flip({ value, label, size = 96, tone, pad }: { value: number | string; label?: string; size?: number; tone?: "live" | "alert"; pad?: number }) {
  const text = typeof value === "number" && pad ? String(value).padStart(pad, "0") : String(value);
  const chars = text.split(""); const colour = tone === "live" ? FLIP.live : tone === "alert" ? FLIP.alert : FLIP.face;
  return (
    <View style={{ alignItems: "center" }} accessibilityLabel={label ? `${text} ${label}` : text}>
      <View style={{ minWidth: size, height: size, paddingHorizontal: size * 0.1, borderRadius: size * 0.19, borderWidth: size >= 72 ? 3 : 2, borderColor: FLIP.edge, backgroundColor: "#15161b", alignItems: "center", justifyContent: "center", overflow: "hidden", ...shadow }}>
        <View style={{ flexDirection: "row", gap: size * 0.045 }}>{chars.map((c, i) => <Flap key={`${chars.length}-${i}`} ch={c} size={size} colour={colour} delay={(chars.length - 1 - i) * 70} />)}</View>
        <View style={{ position: "absolute", left: -2, top: "50%", width: 6, height: size * 0.24, marginTop: -size * 0.12, borderRadius: 3, backgroundColor: FLIP.pin, zIndex: 6 }} />
        <View style={{ position: "absolute", right: -2, top: "50%", width: 6, height: size * 0.24, marginTop: -size * 0.12, borderRadius: 3, backgroundColor: FLIP.pin, zIndex: 6 }} />
      </View>
      {label && <Text style={{ fontFamily: F.display, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: C.label2, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

/* ═══ THE DECK ═══ every tab is a rounded card on the bezel; swipe left/right to slide to the next tab, like flicking through the app switcher. */
const W = Dimensions.get("window").width;
export function Deck({ children, tabs, style }: { children: React.ReactNode; tabs?: string[]; style?: ViewStyle }) {
  const router = useRouter(); const path = usePathname();
  const x = useSharedValue(0);
  const go = (dir: 1 | -1) => {
    if (!tabs) return; const i = tabs.findIndex((t) => path.endsWith(t)); const next = tabs[i + dir];
    if (next) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(tabs)/${next}` as never); }
  };
  const pan = Gesture.Pan().activeOffsetX([-24, 24]).failOffsetY([-16, 16])
    .onUpdate((e) => { x.value = e.translationX * 0.6; })
    .onEnd((e) => { const flick = Math.abs(e.velocityX) > 700 || Math.abs(e.translationX) > W * 0.3; if (flick) runOnJS(go)(e.translationX < 0 ? 1 : -1); x.value = withSpring(0, spring); });
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scale: 1 - Math.min(Math.abs(x.value) / W, 0.06) }] }));
  return (
    <View style={{ flex: 1, backgroundColor: C.bezel }}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[a, { flex: 1, marginHorizontal: 6, marginTop: 6, borderRadius: 28, backgroundColor: C.bg, overflow: "hidden", borderWidth: 0.5, borderColor: C.line }, style]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
/** The chevron-down handle at the top of a pushed page: one tap goes back. */
export function DeckHandle({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  return <Pressable onPress={() => { Haptics.selectionAsync(); onPress ? onPress() : router.back(); }} accessibilityLabel="Back" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.fill, alignItems: "center", justifyContent: "center" }}><ChevronDown color={C.label} size={22} /></Pressable>;
}

/** Sun / moon: one tap flips between the board and a bright room. Long-press for "follow device". */
export function ThemeToggle() {
  const { resolved, set, mode } = useTheme();
  const light = resolved === "paper";
  return (
    <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); set(light ? "dark" : "paper"); }} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); set("system"); }}
      accessibilityLabel={light ? "Switch to dark" : "Switch to light"} accessibilityHint="Hold to follow the phone's setting"
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.fill, alignItems: "center", justifyContent: "center" }}>
      {light ? <Moon color={C.label} size={20} /> : <Sun color={C.label} size={20} />}
      {mode === "system" && <View style={{ position: "absolute", right: 4, bottom: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: C.tint }} />}
    </Pressable>
  );
}

/* ═══ iOS KIT ═══ the pieces a phone screen is built from. Large title, inset grouped list, rows with
   leading / title / detail / trailing, a bottom sheet that follows the thumb, and a 44 pt everything. */
export function Screen({ title, subtitle, right, children, refreshing, onRefresh, tabs }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; refreshing?: boolean; onRefresh?: () => void; tabs?: string[] }) {
  const { ScrollView, RefreshControl } = require("react-native") as typeof import("react-native");
  const { SafeAreaView } = require("react-native-safe-area-context") as typeof import("react-native-safe-area-context");
  return (
    <Deck tabs={tabs}><SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.label2} /> : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14, flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <View style={{ flex: 1 }}>{subtitle && <Text style={{ fontFamily: F.display, fontSize: 13, letterSpacing: 0.8, color: C.label2 }}>{subtitle}</Text>}<Text style={{ fontFamily: F.display, fontSize: 36, lineHeight: 40, color: C.label, letterSpacing: 0.2 }}>{title}</Text></View>
          {right}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView></Deck>
  );
}
/** An inset grouped list — the iOS Settings shape: rounded card, hairline separators inset from the leading edge. */
export function Inset({ header, footer, children, style }: { header?: string; footer?: string; children: React.ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ marginHorizontal: 16, marginBottom: 20 }, style]}>
      {header && <Text style={{ fontFamily: F.display, fontSize: 13, letterSpacing: 0.8, color: C.label2, marginLeft: 16, marginBottom: 6 }}>{header}</Text>}
      <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 0.5, borderColor: C.line, overflow: "hidden" }}>{children}</View>
      {footer && <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.label2, marginLeft: 16, marginTop: 6, lineHeight: 16 }}>{footer}</Text>}
    </View>
  );
}
/** One row: leading (icon or tile) · title + detail · trailing (value, pill, switch) · chevron when tappable. */
export function Cell({ leading, title, detail, trailing, onPress, chevron, first, destructive }: { leading?: React.ReactNode; title: string; detail?: string; trailing?: React.ReactNode; onPress?: () => void; chevron?: boolean; first?: boolean; destructive?: boolean }) {
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingLeft: 16, paddingRight: 14, paddingVertical: 10, borderTopWidth: first ? 0 : 0.5, borderTopColor: C.line, marginLeft: first ? 0 : 0 }}>
      {leading && <View style={{ width: 32, alignItems: "center" }}>{leading}</View>}
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontFamily: F.sans, fontSize: 16, color: destructive ? C.red : C.label }} numberOfLines={1}>{title}</Text>{detail && <Text style={{ fontFamily: F.sans, fontSize: 13, color: C.label2, marginTop: 1 }} numberOfLines={1}>{detail}</Text>}</View>
      {trailing}
      {(chevron ?? !!onPress) && <ChevronRight size={18} color={C.label3} />}
    </View>
  );
  return onPress ? <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => ({ backgroundColor: pressed ? C.fill : "transparent" })}>{inner}</Pressable> : inner;
}
/** A value on the trailing edge of a row, in the numeral face. */
export function Value({ children, tone }: { children: React.ReactNode; tone?: "live" | "alert" | "muted" }) {
  return <Text style={{ fontFamily: F.display, fontSize: 17, color: tone === "live" ? C.tint : tone === "alert" ? C.red : tone === "muted" ? C.label2 : C.label, fontVariant: ["tabular-nums"] }}>{children}</Text>;
}
/** A bottom sheet: slides up, follows the thumb, lets go past 120 px or a flick. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const { Modal, KeyboardAvoidingView } = require("react-native") as typeof import("react-native");
  const y = useSharedValue(0);
  useEffect(() => { if (open) y.value = 0; }, [open, y]);
  const pan = Gesture.Pan().activeOffsetY([12, 999]).onUpdate((e) => { y.value = Math.max(0, e.translationY); }).onEnd((e) => { if (e.translationY > 120 || e.velocityY > 800) runOnJS(onClose)(); else y.value = withSpring(0, spring); });
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  if (!open) return null;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <GestureDetector gesture={pan}>
          <Animated.View entering={FadeInDown.springify().damping(20)} style={[a, { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 34, borderTopWidth: 0.5, borderColor: C.line }]}>
            <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: C.fill2, alignSelf: "center", marginTop: 8, marginBottom: 6 }} />
            {title && <Text style={{ fontFamily: F.display, fontSize: 22, color: C.label, paddingHorizontal: 20, paddingVertical: 8 }}>{title}</Text>}
            <View style={{ paddingHorizontal: 20 }}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </Modal>
  );
}
/** Tappable chips in a row, one selected — the iOS "filter" pattern. */
export function Chips<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => { const on = o.v === value; return <Pressable key={String(o.v)} onPress={() => { Haptics.selectionAsync(); onChange(o.v); }} style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: on ? C.label : C.fill, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: F.sansBold, fontWeight: "600", fontSize: 14, color: on ? C.bg : C.label }}>{o.label}</Text></Pressable>; })}
    </View>
  );
}
/** A round 44 pt icon button for the header's trailing edge. */
export function IconButton({ icon, onPress, label }: { icon: React.ReactNode; onPress: () => void; label: string }) {
  return <Pressable accessibilityLabel={label} onPress={() => { Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? C.fill2 : C.fill, alignItems: "center", justifyContent: "center" })}>{icon}</Pressable>;
}

/* ═══ LOADERS ═══ the board searching for its number — three flaps hunting through digits with a
   stagger. The same Flap the tiles use, so a wait looks like the product, not a spinner. */
const DIGITS = "0123456789";
export function Loader({ size = 56, label, tone = "live" }: { size?: number; label?: string; tone?: "live" | "alert" | undefined }) {
  const [t, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT((x) => x + 1), 380); return () => clearInterval(i); }, []);
  const chars = [0, 1, 2].map((i) => DIGITS[(t * 7 + i * 3) % 10]);
  const colour = tone === "live" ? FLIP.live : tone === "alert" ? FLIP.alert : FLIP.face;
  return (
    <View style={{ alignItems: "center" }} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      <View style={{ height: size, paddingHorizontal: size * 0.1, borderRadius: size * 0.19, borderWidth: 2, borderColor: FLIP.edge, backgroundColor: "#15161b", alignItems: "center", justifyContent: "center", overflow: "hidden", ...shadow }}>
        <View style={{ flexDirection: "row", gap: size * 0.045 }}>{chars.map((c, i) => <Flap key={i} ch={c} size={size} colour={colour} delay={i * 90} />)}</View>
      </View>
      {label && <Text style={{ fontFamily: F.display, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: C.label2, marginTop: 8 }}>{label}</Text>}
    </View>
  );
}
/** A whole screen while it loads: the board searching, and a line that changes so it never looks stuck. */
const LINES = ["Setting the board", "Reading the tickets", "Counting the floor", "Checking the till"];
export function PageLoader({ line }: { line?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (line) return; const t = setInterval(() => setI((x) => (x + 1) % LINES.length), 1600); return () => clearInterval(t); }, [line]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20, backgroundColor: C.bg }}>
      <Loader size={72} />
      <Text style={{ fontFamily: F.display, fontSize: 14, letterSpacing: 0.8, color: C.label2 }}>{line ?? LINES[i]}…</Text>
    </View>
  );
}

/* ═══ TIMED WAIT ═══ minutes and seconds ticking down on flaps, a track emptying beneath. Give it a new
   `seconds` (a fresh quote) and it re-syncs without a jump. At zero it says `doneLabel`. */
export function Countdown({ seconds, label, doneLabel = "now", size = 56, tone }: { seconds: number; label?: string; doneLabel?: string; size?: number; tone?: "live" | "alert" }) {
  const [end, setEnd] = useState(Date.now() + seconds * 1000); const [left, setLeft] = useState(seconds); const total = useRef(Math.max(seconds, 1));
  useEffect(() => { setEnd(Date.now() + seconds * 1000); total.current = Math.max(seconds, 1); setLeft(seconds); }, [seconds]);
  useEffect(() => { const i = setInterval(() => setLeft(Math.max(0, (end - Date.now()) / 1000)), 250); return () => clearInterval(i); }, [end]);
  const s = Math.max(0, Math.round(left)); const m = String(Math.floor(s / 60)).padStart(2, "0"); const ss = String(s % 60).padStart(2, "0"); const done = left <= 0;
  const pct = done ? 1 : Math.min(1, left / total.current);
  return (
    <View style={{ alignItems: "center" }} accessibilityLabel={`${m} minutes ${ss} seconds`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {done ? <Flip value={doneLabel} size={size} tone="live" /> : <><Flip value={m} size={size} tone={tone} /><Text style={{ fontFamily: F.display, fontSize: size * 0.5, color: C.label3 }}>:</Text><Flip value={ss} size={size} tone={tone} /></>}
      </View>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: C.fill2, alignSelf: "stretch", marginTop: 10, overflow: "hidden" }}><View style={{ height: 3, borderRadius: 2, width: `${pct * 100}%`, backgroundColor: tone === "alert" ? FLIP.alert : FLIP.live }} /></View>
      {label && <Text style={{ fontFamily: F.display, fontSize: 12, letterSpacing: 1.6, textTransform: "uppercase", color: C.label2, marginTop: 6 }}>{done ? doneLabel : label}</Text>}
    </View>
  );
}
