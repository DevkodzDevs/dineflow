"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildBill, buildKot, type BillData, type KotData } from "./escpos";
import { billHtml, kotHtml } from "./html";
import { sendToPrinter, type PrinterCfg } from "./transport";
import { cacheGet, cacheSet } from "@/lib/offline/db";

export function usePrinters() {
  const [printers, setPrinters] = useState<PrinterCfg[]>([]);
  useEffect(() => {
    (async () => {
      const cached = await cacheGet<PrinterCfg[]>("printers"); if (cached) setPrinters(cached.v);
      const { data } = await createClient().from("printers").select("id, name, transport, width, address, copies, kind, is_default, station").eq("is_active", true);
      if (data) { setPrinters(data as never); void cacheSet("printers", data); }
    })();
  }, []);
  const pick = useCallback((kind: "bill" | "kot") => (printers as (PrinterCfg & { kind: string; is_default: boolean })[]).filter((p) => p.kind === kind || p.kind === "both").sort((a, b) => Number(b.is_default) - Number(a.is_default)), [printers]);

  const printBill = useCallback(async (d: BillData) => {
    const targets = pick("bill");
    if (!targets.length) { const { printBrowser } = await import("./transport"); printBrowser(billHtml(d), 80); return "browser"; }
    for (const t of targets) await sendToPrinter(t, buildBill(d, t.width === 58 ? 58 : 80), billHtml(d));
    return targets.map((t) => t.name).join(", ");
  }, [pick]);

  const printKot = useCallback(async (d: KotData) => {
    const targets = pick("kot").filter((t) => !(t as PrinterCfg & { station?: string | null }).station || (t as PrinterCfg & { station?: string | null }).station === d.station);
    if (!targets.length) return null;
    for (const t of targets) await sendToPrinter(t, buildKot(d, t.width === 58 ? 58 : 80), kotHtml(d));
    return targets.map((t) => t.name).join(", ");
  }, [pick]);

  return { printers, printBill, printKot, hasPrinter: printers.length > 0 };
}
