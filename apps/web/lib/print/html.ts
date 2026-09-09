import type { BillData, KotData } from "./escpos";
const m = (n: number) => Number(n).toFixed(2);
export const billHtml = (d: BillData) => `
<h1>${d.restaurant.name}</h1>${d.restaurant.address ? `<div class="c">${d.restaurant.address}</div>` : ""}${d.restaurant.gstin ? `<div class="c">GSTIN ${d.restaurant.gstin}</div>` : ""}
<hr><div class="r"><span>${d.billNo}</span><span>${d.tableOrType}</span></div><div class="r"><span>${d.when}</span><span>${d.cashier ? "by " + d.cashier : ""}</span></div>
${d.offline ? '<div class="c b">** OFFLINE COPY **</div>' : ""}<hr>
${d.items.map((i) => `<div class="r"><span>${i.name}</span><span>${i.qty} x ${m(i.price)}</span><span>${m(i.qty * i.price)}</span></div>${i.note ? `<div style="padding-left:8px">${i.note}</div>` : ""}`).join("")}
<hr><div class="r"><span>Subtotal</span><span>${m(d.subtotal)}</span></div>${d.discount > 0 ? `<div class="r"><span>Discount</span><span>-${m(d.discount)}</span></div>` : ""}
<div class="r"><span>CGST</span><span>${m(d.cgst)}</span></div><div class="r"><span>SGST</span><span>${m(d.sgst)}</span></div>${d.roundOff ? `<div class="r"><span>Round off</span><span>${m(d.roundOff)}</span></div>` : ""}
<hr><div class="r big"><span>TOTAL</span><span>${m(d.total)}</span></div>${(d.payments ?? []).map((p) => `<div class="r"><span>${p.method.toUpperCase()}</span><span>${m(p.amount)}</span></div>`).join("")}
<hr><div class="c">${d.footer ?? "Thank you, visit again"}</div>`;
export const kotHtml = (d: KotData) => `
<h1>${d.reprint ? "KOT (REPRINT)" : "KOT"}</h1>${d.station ? `<div class="c">${d.station}</div>` : ""}<hr>
<div class="big">${d.tableOrType}</div><div class="r"><span>${d.kotNo}</span><span>${d.when}</span></div>${d.waiter ? `<div>Waiter: ${d.waiter}</div>` : ""}<hr>
${d.items.map((i) => `<div class="big">${i.qty} &nbsp; ${i.name}</div>${i.note ? `<div>&gt; ${i.note.toUpperCase()}</div>` : ""}`).join("")}<hr>`;
