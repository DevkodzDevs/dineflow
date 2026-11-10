"use client";
/**
 * Text or picture? Each printer has a `script`: `auto` (the default) prints as text unless the bill or
 * ticket carries anything outside Latin-1 — a Tamil or Hindi dish, a symbol — and then as a picture;
 * `text` always the fast ESC/POS text path; `raster` always the picture. An English-only place never
 * pays for the picture; a Tamil one never prints garbage.
 *
 * The choice is per device, in localStorage, because the picture depends on the fonts on this machine
 * (`printers` has no column for it, and this needs no migration). A browser-dialog printer never needs
 * bytes at all, so it always takes the cheap text build.
 */
import { buildBill, buildKot, type BillData, type KotData } from "./escpos";
import { needsRaster } from "./rasterCore";
import type { PrinterCfg, Script } from "./transport";

export const SCRIPTS: { value: Script; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Picture only when a line is in Tamil, Hindi or another script." },
  { value: "text", label: "Text only", hint: "Fastest. Tamil and Hindi print as symbols." },
  { value: "raster", label: "Picture", hint: "Every print drawn with this device's fonts. Slower over Bluetooth." },
];
const KEY = (id: string) => `df-print-script:${id}`;
export function getScript(id: string): Script {
  try { const v = localStorage.getItem(KEY(id)); return v === "text" || v === "raster" ? v : "auto"; } catch { return "auto"; }
}
export function setScript(id: string, s: Script) { try { if (s === "auto") localStorage.removeItem(KEY(id)); else localStorage.setItem(KEY(id), s); } catch { /* private window */ } }

const paper = (cfg: PrinterCfg): 58 | 80 => (cfg.width === 58 ? 58 : 80);
/** What this printer will do with this content. Exported so the settings screen can say which path a test took. */
export function decideScript(cfg: PrinterCfg, content: unknown): "text" | "raster" {
  if (cfg.transport === "browser") return "text";
  const s = cfg.script ?? getScript(cfg.id);
  if (s === "text" || s === "raster") return s;
  const probe = typeof content === "string" ? content : JSON.stringify(content, (k, v) => (k === "qrPng" || k === "upiQr" ? undefined : v));
  return needsRaster(probe) ? "raster" : "text";
}

export async function buildBillBytes(d: BillData, cfg: PrinterCfg): Promise<Uint8Array> {
  if (decideScript(cfg, d) === "raster") return (await import("./raster")).renderBillRaster(d, paper(cfg));
  return buildBill(d, paper(cfg));
}
export async function buildKotBytes(d: KotData, cfg: PrinterCfg): Promise<Uint8Array> {
  if (decideScript(cfg, d) === "raster") return (await import("./raster")).renderKotRaster(d, paper(cfg));
  return buildKot(d, paper(cfg));
}

/** Settings → Printers → Test print: a short bill in three scripts, through whichever path the printer is set to. */
export function sampleBill(restaurant: BillData["restaurant"], footer?: string | null): BillData {
  return {
    restaurant, title: "Test print", billNo: "TEST-001", when: new Date().toLocaleString("en-IN"), tableOrType: "Table T1", cashier: "Test",
    items: [
      { name: "Masala dosa · மசால் தோசை", qty: 2, price: 90 },
      { name: "Paneer tikka · पनीर टिक्का", qty: 1, price: 240, note: "less spicy · காரம் குறைவாக" },
      { name: "Filter coffee", qty: 2, price: 40 },
    ],
    subtotal: 500, discount: 0, cgst: 12.5, sgst: 12.5, roundOff: 0, total: 525, payments: [{ method: "upi", amount: 525 }],
    footer: (footer || "Thank you, visit again") + " · நன்றி · धन्यवाद",
  };
}
