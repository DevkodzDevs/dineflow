import type { BillData, KotData } from "./escpos";
import { taxLabels, COMPOSITION_NOTE } from "@dineflow/shared";
const m = (n: number) => Number(n).toFixed(2);
/** Every value from the database goes through this before it is written into the print window.
 *  Item names, notes, the guest's name and address reach it from public orders (a storefront note
 *  becomes order_items.notes), and transport.ts writes this HTML with document.write into a
 *  same-origin window — unescaped, a note like `<img src=x onerror=…>` ran with the staff member's
 *  session the moment a bill was printed. */
const e = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/* the pay QR is a data: URL the app builds itself; anything else is dropped rather than trusted */
const img = (src: string) => (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src) ? src : "");
export const billHtml = (d: BillData) => { const lab = taxLabels(d.restaurant.stateCode), half = d.gstRate ? d.gstRate / 2 : null, comp = d.restaurant.gstScheme === "composition"; const tn = (k: "central" | "state") => lab[k] + (half !== null ? " @ " + half + "%" : ""); return `
<h1>${e(d.restaurant.name)}</h1>${d.restaurant.address ? `<div class="c">${e(d.restaurant.address)}</div>` : ""}${d.restaurant.gstin ? `<div class="c">GSTIN ${e(d.restaurant.gstin)}</div>` : ""}
<hr><div class="r"><span>${e(d.billNo)}</span><span>${e(d.tableOrType)}</span></div><div class="r"><span>${e(d.when)}</span><span>${d.cashier ? "by " + e(d.cashier) : ""}</span></div>
${d.offline ? '<div class="c b">** OFFLINE COPY **</div>' : ""}<hr>
${d.items.map((i) => `<div class="r"><span>${e(i.name)}</span><span>${e(i.qty)} x ${m(i.price)}</span><span>${m(i.qty * i.price)}</span></div>${i.note ? `<div style="padding-left:8px">${e(i.note)}</div>` : ""}`).join("")}
<hr><div class="r"><span>Subtotal</span><span>${m(d.subtotal)}</span></div>${d.discount > 0 ? `<div class="r"><span>Discount</span><span>-${m(d.discount)}</span></div>` : ""}${d.promiseWaived ? `<div class="r"><span>Promise missed — meal free</span><span>-${m(d.promiseWaived)}</span></div>` : ""}${d.promiseFee ? `<div class="r"><span>On-time promise</span><span>${m(d.promiseFee)}</span></div>` : ""}${d.service ? `<div class="r"><span>Service charge</span><span>${m(d.service)}</span></div>` : ""}${d.charges ? `<div class="r"><span>Packing &amp; delivery</span><span>${m(d.charges)}</span></div>` : ""}
${!comp || d.cgst > 0 ? `<div class="r"><span>${e(tn("central"))}</span><span>${m(d.cgst)}</span></div>` : ""}${!comp || d.sgst > 0 ? `<div class="r"><span>${e(tn("state"))}</span><span>${m(d.sgst)}</span></div>` : ""}${d.roundOff ? `<div class="r"><span>Round off</span><span>${m(d.roundOff)}</span></div>` : ""}
<hr><div class="r big"><span>TOTAL</span><span>${m(d.total)}</span></div>${(d.payments ?? []).map((p) => `<div class="r"><span>${e(String(p.method).toUpperCase())}</span><span>${m(p.amount)}</span></div>`).join("")}
${d.qrPng && img(d.qrPng) ? `<div class="c" style="margin-top:8px"><img src="${img(d.qrPng)}" width="150" height="150" alt=""><div>Scan to pay (UPI / card)</div></div>` : ""}
<div style="font-size:10px;margin-top:6px">${d.sac ? `SAC ${e(d.sac)} · ` : ""}${lab.stateName ? `Place of supply: ${e(lab.stateName)} (${e(d.restaurant.stateCode)}) · ` : ""}Reverse charge: No</div>${comp ? `<div class="b" style="font-size:10px">${e(COMPOSITION_NOTE)}</div>` : ""}${(d.taxLines?.length ?? 0) > 1 ? d.taxLines!.map((t) => `<div class="r" style="font-size:10px"><span>GST ${e(t.rate)}% on ${m(t.base)}</span><span>${m(t.cgst + t.sgst)}</span></div>`).join("") : ""}${d.operatorNote ? `<div class="b" style="font-size:10px">${e(d.operatorNote)}</div>` : ""}
<hr><div class="c">${e(d.footer ?? "Thank you, visit again")}</div>`; };
export const kotHtml = (d: KotData) => `
<h1>${d.reprint ? "KOT (REPRINT)" : "KOT"}</h1>${d.station ? `<div class="c">${e(d.station)}</div>` : ""}<hr>
<div class="big">${e(d.tableOrType)}</div><div class="r"><span>${e(d.kotNo)}</span><span>${e(d.when)}</span></div>${d.waiter ? `<div>Waiter: ${e(d.waiter)}</div>` : ""}<hr>
${d.items.map((i) => `<div class="big">${e(i.qty)} &nbsp; ${e(i.name)}</div>${i.note ? `<div>&gt; ${e(i.note.toUpperCase())}</div>` : ""}`).join("")}<hr>`;

/** A credit note (0146), printed from the bill page: who issues it, its own number and date, the bill it reduces, why,
 *  the value and the GST taken back, and how the money went back. */
export type CreditNoteData = { restaurant: BillData["restaurant"]; cnNo: string; when: string; billNo: string; billWhen: string; reason: string; amount: number; taxable: number; cgst: number; sgst: number; method: string };
export const creditNoteHtml = (d: CreditNoteData) => { const lab = taxLabels(d.restaurant.stateCode); return `
<h1>${e(d.restaurant.name)}</h1>${d.restaurant.address ? `<div class="c">${e(d.restaurant.address)}</div>` : ""}${d.restaurant.gstin ? `<div class="c">GSTIN ${e(d.restaurant.gstin)}</div>` : ""}
<div class="c b" style="margin-top:4px">CREDIT NOTE</div>
<hr><div class="r"><span>${e(d.cnNo)}</span><span>${e(d.when)}</span></div><div class="r"><span>Against ${e(d.billNo)}</span><span>${e(d.billWhen)}</span></div>
<div>Reason: ${e(d.reason)}</div>
<hr><div class="r"><span>Taxable value</span><span>${m(d.taxable)}</span></div><div class="r"><span>${e(lab.central)}</span><span>${m(d.cgst)}</span></div><div class="r"><span>${e(lab.state)}</span><span>${m(d.sgst)}</span></div>
<hr><div class="r big"><span>REFUND</span><span>${m(d.amount)}</span></div><div class="r"><span>Paid back by</span><span>${e(String(d.method).toUpperCase())}</span></div>
<div style="font-size:10px;margin-top:6px">${lab.stateName ? `Place of supply: ${e(lab.stateName)} (${e(d.restaurant.stateCode)}) · ` : ""}Reverse charge: No</div>
<hr><div class="c" style="margin-top:18px">Authorised signatory</div>`; };
