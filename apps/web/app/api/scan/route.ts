import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createBare } from "@supabase/supabase-js";
import { scanResultSchema } from "@dineflow/shared";

/**
 * POST /api/scan  { image: base64 data URL, hint?: "ingredient"|"dish"|"room"|"labour"|"auto" }
 * Sends the photo to Claude vision and returns a typed ScanResult.
 * Works for the web page and for the mobile app (same Supabase session cookie / bearer token).
 */
const PROMPT = `You are DineFlow's scanner for an Indian restaurant/hotel/resort. Look at the photo and return ONLY a JSON object, no prose, no markdown:
{
 "kind": "ingredient" | "dish" | "room" | "labour" | "product" | "unknown",
 "name": short name in English (e.g. "Tomato", "Coriander bunch", "Chicken biryani", "Room 104", "Amul butter 500 g"),
 "confidence": 0..1,
 "unit": "kg" | "g" | "l" | "ml" | "pcs"   (loose vegetables/fruit/grains/meat → "kg"; bunches, eggs, packets, bottles → "pcs"; liquids → "l"),
 "estimated_qty": number in that unit visible in the photo (a handful of tomatoes ≈ 0.2, a bag ≈ 1, one bunch = 1),
 "category": "vegetable"|"fruit"|"grocery"|"dairy"|"meat"|"seafood"|"beverage"|"packaged"|"cleaning"|"other",
 "brand": brand name if a packaged product, else omit,
 "barcode": digits if a barcode is readable, else omit,
 "price_estimate_inr": typical Indian market price per unit (per kg / per piece / per litre) as a number,
 "is_veg": true/false when kind = "dish",
 "description": one line (for dishes: main ingredients; for products: pack size),
 "room_number": when kind = "room" and a door number / key tag is visible,
 "labour": when the photo is a person, an ID card (Aadhaar, voter ID, licence) or a worker: { "full_name", "phone", "id_type", "id_last4" (ONLY the last 4 digits), "skill", "address" } — never return a full ID number,
 "notes": anything useful (ripeness, damage, expiry date, quantity of packs seen)
}
kind rules: raw produce/groceries/packaged goods → "ingredient" (a scanned pack is still "ingredient"); a cooked/plated dish or a menu photo → "dish"; a hotel room, door number, key card or room interior → "room"; a person or an identity document → "labour"; anything else → "unknown". If several items of the SAME thing are visible, sum them into estimated_qty. If the hint says a kind, prefer that kind unless clearly wrong.`;

export async function POST(req: Request) {
  // Web sends the session cookie; the phone app sends "Authorization: Bearer <access_token>".
  const auth = req.headers.get("authorization");
  const supabase = auth?.startsWith("Bearer ") ? createBare(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } }) : await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  const { image, hint = "auto" } = await req.json();

  // No API key? Return a realistic sample so the whole scan → confirm → create flow can be
  // tried end to end. The card is marked "sample" in the UI; add the key for real recognition.
  if (!key) {
    const samples: Record<string, Record<string, unknown>> = {
      ingredient: { kind: "ingredient", name: "Tomato", confidence: 0.35, unit: "kg", estimated_qty: 0.25, category: "vegetable", price_estimate_inr: 40, notes: "Sample result — add ANTHROPIC_API_KEY for real photo recognition", demo: true },
      dish: { kind: "dish", name: "Chicken biryani", confidence: 0.35, is_veg: false, price_estimate_inr: 280, description: "Rice, chicken, whole spices", notes: "Sample result — add ANTHROPIC_API_KEY for real photo recognition", demo: true },
      room: { kind: "room", name: "Room 104", confidence: 0.35, room_number: "104", notes: "Sample result — add ANTHROPIC_API_KEY for real photo recognition", demo: true },
      labour: { kind: "labour", name: "Murugan", confidence: 0.35, labour: { full_name: "Murugan", phone: "", id_type: "Aadhaar", id_last4: "7781", skill: "gardener" }, notes: "Sample result — only the last 4 ID digits are ever stored", demo: true },
    };
    const pick = samples[hint] ?? samples.ingredient;
    await supabase.from("scan_log").insert({ source: "photo", kind: pick.kind as string, result: pick, created_by: user.id });
    return NextResponse.json(pick);
  }
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(image ?? "");
  if (!m) return NextResponse.json({ error: "bad image" }, { status: 400 });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 600, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }, { type: "text", text: PROMPT + `\nHint: ${hint}` }] }] }),
  });
  if (!res.ok) return NextResponse.json({ error: `recognition failed (${res.status})` }, { status: 502 });
  const data = await res.json();
  const text = (data.content ?? []).map((c: { text?: string }) => c.text ?? "").join("").replace(/```json|```/g, "").trim();
  try {
    const parsed = scanResultSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return NextResponse.json({ error: "could not read the photo, try again closer" }, { status: 422 });
    await supabase.from("scan_log").insert({ source: "photo", kind: parsed.data.kind, result: parsed.data, created_by: user.id });
    return NextResponse.json(parsed.data);
  } catch { return NextResponse.json({ error: "could not read the photo, try again closer" }, { status: 422 }); }
}
