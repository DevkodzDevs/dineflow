import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
export const dynamic = "force-dynamic";

/** Runs one whitelisted action, only after the person tapped Confirm in the panel. Nothing else is reachable from here. */
export async function POST(req: Request) {
  const { kind, arg } = (await req.json()) as { kind: string; arg: string };
  const session = await requireSession(); const s = await createClient();
  switch (kind) {
    case "call_walkin": {
      if (!/^[0-9a-f-]{36}$/.test(arg)) return NextResponse.json({ error: "bad id" }, { status: 400 });
      const { error } = await s.rpc("walkin_set", { p_id: arg, p_status: "called", p_table: null });
      return error ? NextResponse.json({ error: error.message }, { status: 400 }) : NextResponse.json({ done: "Called. Their phone now says \"You're up\"." });
    }
    case "reorder_message": {
      const { data: low } = await s.from("v_low_stock").select("name, unit, current_stock, reorder_level");
      if (!low?.length) return NextResponse.json({ done: "Nothing is below reorder right now." });
      const lines = (low as { name: string; unit: string; current_stock: number; reorder_level: number }[]).map((i) => `• ${i.name} — ${Math.max(1, Math.ceil(Number(i.reorder_level) * 2 - Number(i.current_stock)))} ${i.unit}`);
      const msg = `Hello, order for ${session.restaurant.name}, please deliver tomorrow morning:\n${lines.join("\n")}\nThank you.`;
      return NextResponse.json({ done: "Drafted below. Copy it into WhatsApp.", text: msg });
    }
    case "open": return /^\/[a-z-]+(\/[a-z0-9-]+)?$/.test(arg) ? NextResponse.json({ done: "Opening.", go: arg }) : NextResponse.json({ error: "bad path" }, { status: 400 });
    default: return NextResponse.json({ error: "not an allowed action" }, { status: 400 });
  }
}
