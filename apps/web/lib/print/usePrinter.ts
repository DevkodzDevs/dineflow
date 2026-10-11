"use client";
import { useCallback, useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/lazy";
import { buildBill, buildKot, drawerBytes, type BillData, type KotData } from "./escpos";
import { billHtml, kotHtml } from "./html";
import { sendToPrinter, type PrinterCfg } from "./transport";
import { ticketsFor } from "./route";
import { cacheGet, cacheSet } from "@/lib/offline/db";

export function usePrinters() {
  const [printers, setPrinters] = useState<PrinterCfg[]>([]);
  useEffect(() => {
    (async () => {
      const cached = await cacheGet<PrinterCfg[]>("printers"); if (cached) setPrinters(cached.v);
      const { data } = await (await getClient()).from("printers").select("id, name, transport, width, address, copies, kind, is_default, station, drawer").eq("is_active", true);
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

  /* A printer with no station prints the whole ticket; a printer bound to a station prints only the
     lines that station makes, and nothing when none of them are its own. Until 0087 no screen passed a
     station at all, so a station printer never saw a ticket — the grill's printer sat silent while the
     counter's printed everything. Each line now carries its dish's station (else its category's). */
  const printKot = useCallback(async (d: KotData) => {
    const targets = pick("kot")
      /* A kitchen docket prints by itself the instant an order is sent, so a printer that can only
         print by opening the browser's print dialog has no place in that path: it stops the till
         dead with a modal between "Send to kitchen" and the order screen, and someone has to
         dismiss it before they can take the next table. Bluetooth, USB and the network bridge all
         print silently and still do.
         A reprint is the exception: somebody pressed the printer button on the kitchen screen
         asking for paper, so the dialog is the answer rather than the interruption. Same reasoning
         as printBill, which keeps its browser fallback for exactly that reason. */
      .filter((t) => t.transport !== "browser" || d.reprint === true) as (PrinterCfg & { station?: string | null })[];
    if (!targets.length) return null;
    const printed: string[] = [];
    for (const { printer: t, ticket } of ticketsFor(targets, d)) {
      await sendToPrinter(t, buildKot(ticket, t.width === 58 ? 58 : 80), kotHtml(ticket));
      printed.push(t.name);
    }
    return printed.length ? printed.join(", ") : null;
  }, [pick]);

  /* The drawer: every bill printer whose "kick the drawer" switch is on gets the pulse. The switch
     was saved by Settings → Printers and read by nothing until 0087. Browser printing cannot do it. */
  const openDrawer = useCallback(async () => {
    const targets = (printers as (PrinterCfg & { kind: string; drawer?: boolean })[]).filter((p) => p.drawer && (p.kind === "bill" || p.kind === "both") && p.transport !== "browser");
    for (const t of targets) await sendToPrinter({ ...t, copies: 1 }, drawerBytes());
    return targets.length;
  }, [printers]);

  return { printers, printBill, printKot, openDrawer, hasPrinter: printers.length > 0, hasDrawer: (printers as (PrinterCfg & { drawer?: boolean })[]).some((p) => p.drawer) };
}
