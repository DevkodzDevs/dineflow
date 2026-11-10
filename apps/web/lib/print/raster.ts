"use client";
/**
 * Raster printing — the bill or KOT drawn to a 1-bit picture and sent as ESC/POS `GS v 0` bands, so a
 * dish named "மசால் தோசை" or "पनीर टिक्का" comes out as it reads instead of code-page garbage. The
 * device's own fonts draw the text (a Tamil or Hindi till already has them); the printer only sees pixels.
 *
 * Browser-only: it needs a canvas. The pure parts (packing, the command, wrapping, the "needs a picture?"
 * test) live in `rasterCore.ts` and are unit-tested there. The lines drawn here are the lines `escpos.ts`
 * prints — keep the two in step when the bill changes.
 */
import { taxLabels, COMPOSITION_NOTE } from "@dineflow/shared";
import type { BillData, KotData } from "./escpos";
import { DOTS, rasterCommand, thresholdRows, trimBlankTail, wrapText } from "./rasterCore";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const FONT = '"Noto Sans Tamil", "Noto Sans Devanagari", "Noto Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const money = (n: number) => Number(n).toFixed(2);

function makeCanvas(w: number, h: number): { ctx: Ctx } {
  if (typeof OffscreenCanvas !== "undefined") { const c = new OffscreenCanvas(w, h); return { ctx: c.getContext("2d")! as Ctx }; }
  const c = document.createElement("canvas"); c.width = w; c.height = h; return { ctx: c.getContext("2d")! as Ctx };
}

type Style = { size?: number; bold?: boolean; align?: "l" | "c" | "r"; indent?: number };

/** A receipt laid out as a list of drawing steps. Text is measured as it is added (so it wraps and the
 *  page knows its height), then everything is drawn once onto a canvas exactly that tall. */
class Sheet {
  private ops: ((ctx: Ctx) => void)[] = [];
  y = 0;
  readonly margin = 6;
  readonly base: number;
  private meas: Ctx;
  constructor(readonly w: number, width: 58 | 80) {
    this.base = width === 58 ? 22 : 24;
    this.meas = makeCanvas(8, 8).ctx;
  }
  get inner() { return this.w - this.margin * 2; }
  font(size = this.base, bold = false) { return `${bold ? "bold " : ""}${size}px ${FONT}`; }
  measure(s: string, size = this.base, bold = false) { this.meas.font = this.font(size, bold); return this.meas.measureText(s).width; }
  private lineH(size: number) { return Math.round(size * 1.45); }   // Tamil and Devanagari carry tall marks above and below
  private draw(s: string, x: number, y: number, size: number, bold: boolean, align: "l" | "c" | "r") {
    this.ops.push((ctx) => { ctx.font = this.font(size, bold); ctx.textAlign = align === "c" ? "center" : align === "r" ? "right" : "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#000"; ctx.fillText(s, x, y); });
  }
  /** A paragraph: wrapped to the paper, each line placed. */
  text(s: string, st: Style = {}) {
    const size = st.size ?? this.base, bold = st.bold ?? false, align = st.align ?? "l", indent = st.indent ?? 0;
    const maxW = this.inner - indent, lh = this.lineH(size);
    for (const line of wrapText((t) => this.measure(t, size, bold), s, maxW)) {
      const x = align === "c" ? this.w / 2 : align === "r" ? this.w - this.margin : this.margin + indent;
      this.draw(line, x, this.y + size, size, bold, align);
      this.y += lh;
    }
    return this;
  }
  /** Left text with a right-aligned figure on the first line; the left wraps around the figure's width. */
  row(left: string, right: string, st: Style = {}) {
    const size = st.size ?? this.base, bold = st.bold ?? false, lh = this.lineH(size);
    const rw = this.measure(right, size, bold) + (right ? 12 : 0);
    const lines = wrapText((t) => this.measure(t, size, bold), left, this.inner - rw);
    this.draw(right, this.w - this.margin, this.y + size, size, bold, "r");
    for (const line of lines) { this.draw(line, this.margin, this.y + size, size, bold, "l"); this.y += lh; }
    return this;
  }
  /** name | qty x price | amount — the name takes the left 52%, wrapping; the two figures sit on its first line. */
  cols3(a: string, b: string, c: string) {
    const size = this.base, lh = this.lineH(size);
    const A = Math.floor(this.inner * 0.52), xB = this.margin + Math.floor(this.inner * 0.76);
    const lines = wrapText((t) => this.measure(t, size), a, A);
    this.draw(b, xB, this.y + size, size, false, "r");
    this.draw(c, this.w - this.margin, this.y + size, size, false, "r");
    for (const line of lines) { this.draw(line, this.margin, this.y + size, size, false, "l"); this.y += lh; }
    return this;
  }
  rule(double = false) {
    const y = this.y + 6;
    this.ops.push((ctx) => { ctx.fillStyle = "#000"; for (let x = this.margin; x < this.w - this.margin; x += 8) ctx.fillRect(x, y, 5, 2); if (double) for (let x = this.margin; x < this.w - this.margin; x += 8) ctx.fillRect(x, y + 4, 5, 2); });
    this.y += double ? 16 : 14;
    return this;
  }
  gap(px: number) { this.y += px; return this; }
  /** A QR drawn module by module from the `qrcode` matrix — works on an OffscreenCanvas, which has no <img>. */
  async qr(data: string, target = 230) {
    const { create } = await import("qrcode");
    const q = create(data, { errorCorrectionLevel: "M" });
    const n = q.modules.size, scale = Math.max(2, Math.floor(target / n)), side = n * scale, x0 = Math.floor((this.w - side) / 2), y0 = this.y;
    const dark = q.modules.data;
    this.ops.push((ctx) => { ctx.fillStyle = "#000"; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark[r * n + c]) ctx.fillRect(x0 + c * scale, y0 + r * scale, scale, scale); });
    this.y += side + 8;
    return this;
  }
  /** Draw everything, threshold to ink, pack to rows. */
  rows(): Uint8Array[] {
    const h = Math.max(8, Math.ceil(this.y) + 4);
    const { ctx } = makeCanvas(this.w, h);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, this.w, h);
    for (const op of this.ops) op(ctx);
    const img = ctx.getImageData(0, 0, this.w, h);
    return trimBlankTail(thresholdRows(img.data, this.w, h));
  }
}

async function fontsReady() { try { await (globalThis as { document?: { fonts?: { ready?: Promise<unknown> } } }).document?.fonts?.ready; } catch { /* no font API */ } }

/** ESC @ + code page, the raster bands, then feed and cut — the same frame as the text path. */
function frame(rows: Uint8Array[], widthPx: number, feedBefore = 0) {
  const head = [0x1b, 0x40, 0x1b, 0x61, 0x00];
  const body = rasterCommand(widthPx, rows);
  const tail = [...(feedBefore ? [0x1b, 0x64, feedBefore] : []), 0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00];
  const out = new Uint8Array(head.length + body.length + tail.length);
  out.set(head, 0); out.set(body, head.length); out.set(tail, head.length + body.length);
  return out;
}

/** The bill as a picture. Mirrors `buildBill` line for line. */
export async function renderBillRaster(d: BillData, width: 58 | 80 = 80): Promise<Uint8Array> {
  await fontsReady();
  const s = new Sheet(DOTS[width], width), b = s.base;
  s.text(d.restaurant.name, { size: Math.round(b * 1.5), bold: true, align: "c" });
  if (d.restaurant.address) s.text(d.restaurant.address, { align: "c" });
  if (d.restaurant.phone) s.text(d.restaurant.phone, { align: "c" });
  if (d.restaurant.legalName && d.restaurant.legalName !== d.restaurant.name) s.text(d.restaurant.legalName, { align: "c" });
  if (d.restaurant.gstin) s.text("GSTIN " + d.restaurant.gstin, { align: "c" });
  if (d.title) s.text(d.title.toUpperCase(), { align: "c", bold: true });
  s.rule(true).row(d.billNo, d.tableOrType).row(d.when, d.cashier ? "by " + d.cashier : "");
  if (d.offline) s.text("** OFFLINE COPY **", { align: "c", bold: true });
  s.rule();
  for (const i of d.items) { s.cols3(i.name, `${i.qty} x ${money(i.price)}`, money(i.qty * i.price)); i.extras?.forEach((x) => s.text(x, { indent: 16 })); if (i.note) s.text(i.note, { indent: 16 }); }
  s.rule().row("Subtotal", money(d.subtotal));
  if (d.discount > 0) s.row("Discount", "-" + money(d.discount));
  if (d.promiseWaived) s.row("Promise missed - meal free", "-" + money(d.promiseWaived));
  if (d.promiseFee) s.row("On-time promise", money(d.promiseFee));
  if (d.service) s.row("Service charge", money(d.service));
  if (d.charges) s.row("Packing & delivery", money(d.charges));
  const lab = taxLabels(d.restaurant.stateCode), half = d.gstRate ? d.gstRate / 2 : null, comp = d.restaurant.gstScheme === "composition";
  const tn = (k: "central" | "state") => lab[k] + (half !== null ? " @" + half + "%" : "");
  if (!comp || d.cgst > 0) s.row(tn("central"), money(d.cgst));
  if (!comp || d.sgst > 0) s.row(tn("state"), money(d.sgst));
  if (d.roundOff) s.row("Round off", money(d.roundOff));
  s.rule().row("TOTAL", money(d.total), { size: Math.round(b * 1.4), bold: true });
  d.payments?.forEach((x) => s.row(x.method.toUpperCase(), money(x.amount)));
  s.gap(4).text((d.sac ? "SAC " + d.sac + " | " : "") + (lab.stateName ? "Place of supply: " + lab.stateName + " (" + d.restaurant.stateCode + ") | " : "") + "Reverse charge: No", { size: Math.round(b * 0.85) });
  if (comp) s.text(COMPOSITION_NOTE, { size: Math.round(b * 0.85), bold: true });
  if ((d.taxLines?.length ?? 0) > 1) d.taxLines!.forEach((t) => s.row(`GST ${t.rate}% on ${money(t.base)}`, money(t.cgst + t.sgst), { size: Math.round(b * 0.85) }));
  if (d.operatorNote) s.text(d.operatorNote, { size: Math.round(b * 0.85), bold: true });
  s.rule();
  if (d.upiQr) { s.text("Scan to pay (UPI / card)", { align: "c" }); await s.qr(d.upiQr); }
  if (d.loyalty) s.text(d.loyalty, { align: "c", bold: true });
  s.text(d.footer ?? "Thank you, visit again", { align: "c" }).gap(8);
  return frame(s.rows(), DOTS[width]);
}

/** The kitchen ticket as a picture. Mirrors `buildKot`. A dish's `localName` prints under its name. */
export async function renderKotRaster(d: KotData, width: 58 | 80 = 80): Promise<Uint8Array> {
  await fontsReady();
  const s = new Sheet(DOTS[width], width), b = s.base, big = Math.round(b * 1.4);
  s.text(d.reprint ? "KOT (REPRINT)" : "KOT", { size: big, bold: true, align: "c" });
  if (d.station) s.text(d.station, { align: "c", bold: true });
  s.rule(true).text(d.tableOrType, { size: big, bold: true }).row(d.kotNo, d.when);
  if (d.heading) s.text(d.heading, { bold: true });
  if (d.waiter) s.text("Waiter: " + d.waiter);
  s.rule();
  for (const i of d.items) {
    s.text(`${i.qty}  ${i.name}`, { size: big, bold: true });
    if (i.localName && i.localName !== i.name) s.text(i.localName, { size: Math.round(b * 1.2), bold: true, indent: 24 });
    i.extras?.forEach((x) => s.text(x.toUpperCase(), { indent: 24 }));
    if (i.note) s.text("> " + i.note.toUpperCase(), { indent: 24 });
  }
  s.rule().gap(8);
  return frame(s.rows(), DOTS[width], 1);
}
