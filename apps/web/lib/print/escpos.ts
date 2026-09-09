/** ESC/POS builder — produces the raw bytes a thermal printer understands (58 mm = 32 chars, 80 mm = 48). */
const enc = new TextEncoder();
export class Escpos {
  private parts: number[] = [];
  constructor(public width: 58 | 80 = 80) { this.raw(0x1b, 0x40); this.raw(0x1b, 0x74, 0x00); }   // init + codepage
  get cols() { return this.width === 58 ? 32 : 48; }
  raw(...b: number[]) { this.parts.push(...b); return this; }
  text(s: string) { this.parts.push(...enc.encode(s)); return this; }
  line(s = "") { return this.text(s + "\n"); }
  align(a: "l" | "c" | "r") { return this.raw(0x1b, 0x61, a === "c" ? 1 : a === "r" ? 2 : 0); }
  bold(on: boolean) { return this.raw(0x1b, 0x45, on ? 1 : 0); }
  size(w: 1 | 2 | 3, h: 1 | 2 | 3 = w) { return this.raw(0x1d, 0x21, ((w - 1) << 4) | (h - 1)); }
  underline(on: boolean) { return this.raw(0x1b, 0x2d, on ? 1 : 0); }
  rule(ch = "-") { return this.line(ch.repeat(this.cols)); }
  /** left/right justified row, e.g. "Chicken biryani        2 × 280   560.00" */
  row(left: string, right: string) {
    const r = right.slice(0, this.cols); const l = left.slice(0, Math.max(0, this.cols - r.length - 1));
    return this.line(l + " ".repeat(Math.max(1, this.cols - l.length - r.length)) + r);
  }
  cols3(a: string, b: string, c: string, wa = 0.55, wb = 0.2) {
    const A = Math.floor(this.cols * wa), B = Math.floor(this.cols * wb), C = this.cols - A - B;
    return this.line(a.slice(0, A - 1).padEnd(A) + b.slice(0, B - 1).padStart(B) + c.slice(0, C).padStart(C));
  }
  wrap(s: string, indent = 0) { const w = this.cols - indent; for (let i = 0; i < s.length; i += w) this.line(" ".repeat(indent) + s.slice(i, i + w)); return this; }
  qr(data: string, size = 6) {
    const d = enc.encode(data), n = d.length + 3;
    this.raw(0x1d, 0x28, 0x6b, 4, 0, 49, 65, 50, 0).raw(0x1d, 0x28, 0x6b, 3, 0, 49, 67, size).raw(0x1d, 0x28, 0x6b, 3, 0, 49, 69, 48)
      .raw(0x1d, 0x28, 0x6b, n & 0xff, (n >> 8) & 0xff, 49, 80, 48); this.parts.push(...d);
    return this.raw(0x1d, 0x28, 0x6b, 3, 0, 49, 81, 48);
  }
  feed(n = 4) { return this.raw(0x1b, 0x64, n); }
  cut() { return this.feed(4).raw(0x1d, 0x56, 0x42, 0x00); }
  drawer() { return this.raw(0x1b, 0x70, 0x00, 0x19, 0xfa); }
  bytes() { return new Uint8Array(this.parts); }
}

const money = (n: number) => Number(n).toFixed(2);
export type BillData = { restaurant: { name: string; address?: string | null; phone?: string | null; gstin?: string | null }; billNo: string; when: string; tableOrType: string; cashier?: string; items: { name: string; qty: number; price: number; note?: string | null }[]; subtotal: number; discount: number; cgst: number; sgst: number; service?: number; roundOff: number; total: number; payments?: { method: string; amount: number }[]; footer?: string; upiQr?: string; offline?: boolean };

export function buildBill(d: BillData, width: 58 | 80 = 80) {
  const p = new Escpos(width);
  p.align("c").size(2).bold(true).line(d.restaurant.name).size(1).bold(false);
  if (d.restaurant.address) p.wrap(d.restaurant.address);
  if (d.restaurant.phone) p.line(d.restaurant.phone);
  if (d.restaurant.gstin) p.line("GSTIN " + d.restaurant.gstin);
  p.rule("=").align("l").row(d.billNo, d.tableOrType).row(d.when, d.cashier ? "by " + d.cashier : "");
  if (d.offline) p.align("c").bold(true).line("** OFFLINE COPY **").bold(false).align("l");
  p.rule();
  d.items.forEach((i) => { p.cols3(i.name, `${i.qty} x ${money(i.price)}`, money(i.qty * i.price)); if (i.note) p.wrap("  " + i.note, 2); });
  p.rule().row("Subtotal", money(d.subtotal));
  if (d.discount > 0) p.row("Discount", "-" + money(d.discount));
  if (d.service) p.row("Service charge", money(d.service));
  p.row("CGST", money(d.cgst)).row("SGST", money(d.sgst));
  if (d.roundOff) p.row("Round off", money(d.roundOff));
  p.rule().size(2).bold(true).row("TOTAL", money(d.total)).size(1).bold(false);
  d.payments?.forEach((x) => p.row(x.method.toUpperCase(), money(x.amount)));
  p.rule();
  if (d.upiQr) p.align("c").line("Scan to pay").qr(d.upiQr).feed(1);
  p.align("c").line(d.footer ?? "Thank you, visit again").line("").cut();
  return p.bytes();
}

export type KotData = { kotNo: string; when: string; tableOrType: string; waiter?: string; station?: string | null; items: { name: string; qty: number; note?: string | null }[]; reprint?: boolean };
export function buildKot(d: KotData, width: 58 | 80 = 80) {
  const p = new Escpos(width);
  p.align("c").size(2).bold(true).line(d.reprint ? "KOT (REPRINT)" : "KOT").size(1).line(d.station ?? "").bold(false).rule("=").align("l");
  p.size(2).bold(true).line(d.tableOrType).size(1).bold(false).row(d.kotNo, d.when);
  if (d.waiter) p.line("Waiter: " + d.waiter);
  p.rule();
  d.items.forEach((i) => { p.size(2).bold(true).line(`${i.qty}  ${i.name}`.slice(0, p.cols)).size(1).bold(false); if (i.note) p.wrap("   > " + i.note.toUpperCase(), 3); });
  p.rule().feed(1).cut();
  return p.bytes();
}
