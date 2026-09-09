import { View, Text, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, { FadeInDown, FadeOut, Layout } from "react-native-reanimated";
import { C, F, shadow } from "@/lib/theme";

/** DineFlow's signature: the KOT ticket with a perforated top edge. */
export function Ticket({ no, title, meta, tone = "pending", children, footer }: { no: number; title: string; meta?: string; tone?: "pending" | "preparing" | "ready" | "served" | "alert"; children: React.ReactNode; footer?: React.ReactNode }) {
  const dot = { pending: C.line, preparing: C.saffron, ready: C.mint, served: C.steel, alert: C.chili }[tone];
  const teeth = Array.from({ length: 24 }, (_, i) => `L${i * 16 + 8} 0 L${i * 16 + 16} 8`).join(" ");
  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} exiting={FadeOut} layout={Layout.springify()} style={s.wrap}>
      <Svg height={8} width="100%" viewBox="0 0 384 8" preserveAspectRatio="none" style={{ marginBottom: -1 }}><Path d={`M0 8 ${teeth} L384 8 Z`} fill={C.card} /></Svg>
      <View style={s.body}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.steel }}>KOT #{no}</Text>
            <Text style={{ fontFamily: F.sansBold, fontSize: 18, color: C.ink }}>{title}</Text>
            {meta && <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.steel, marginTop: 2 }}>{meta}</Text>}
          </View>
          <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: dot, marginTop: 6 }} />
        </View>
        <View style={s.divider} />
        <View style={{ gap: 6 }}>{children}</View>
        {footer && <><View style={s.divider} />{footer}</>}
      </View>
    </Animated.View>
  );
}
const s = StyleSheet.create({
  wrap: { ...shadow },
  body: { backgroundColor: C.card, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 14, borderWidth: 1, borderTopWidth: 0, borderColor: C.line },
  divider: { borderTopWidth: 1, borderStyle: "dashed", borderColor: C.line, marginVertical: 10 },
});
