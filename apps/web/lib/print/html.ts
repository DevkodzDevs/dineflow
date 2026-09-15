import type { BillData, KotData } from "./escpos";
import { taxLabels, COMPOSITION_NOTE } from "@dineflow/shared";
const m = (n: number) => Number(n).toFixed(2);
export const billHtml = (d: BillData) => { const lab = taxLabels(d.restaurant.stateCode), half = d.gstRate ? d.gstRate / 2 : null, comp = d.restaurant.gstScheme === "composition"; const tn = (k: "central" | "state") => lab[k] + (half !== null ? " @ " + half + "%" : ""); return `
<h1>${d.restaurant.name}</h1>${d.restaurant.address ? `<div class="c">${d.restaurant.address}</div>` : ""}${d.restaurant.gstin ? `<div class="c">GSTIN ${d.restaurant.gstin}</div>` : ""}
<hr><div class="r"><span>${d.billNo}</span><span>${d.tableOrType}</span></div><div class="r"><span>${d.when}</span><span>${d.cashier ? "by " + d.cashier : ""}</span></div>
${d.offline ? '<div class="c b">** OFFLINE COPY **</div>' : ""}<hr>
${d.items.map((i) => `<div class="r"><span>${i.name}</span><span>${i.qty} x ${m(i.price)}</span><span>${m(i.qty * i.price)}</span></div>${i.note ? `<div style="padding-left:8px">${i.note}</div>` : ""}`).join("")}
<hr><div class="r"><span>Subtotal</span><span>${m(d.subtotal)}</span></div>${d.discount > 0 ? `<div class="r"><span>Discount</span><span>-${m(d.discount)}</span></div>` : ""}
${!comp || d.cgst > 0 ? `<div class="r"><span>${tn("central")}</span><span>${m(d.cgst)}</span></div>` : ""}${!comp || d.sgst > 0 ? `<div class="r"><span>${tn("state")}</span><span>${m(d.sgst)}</span></div>` : ""}${d.roundOff ? `<div class="r"><span>Round off</span><span>${m(d.roundOff)}</span></div>` : ""}
<hr><div class="r big"><span>TOTAL</span><span>${m(d.total)}</span></div>${(d.payments ?? []).map((p) => `<div class="r"><span>${p.method.toUpperCase()}</span><span>${m(p.amount)}</span></div>`).join("")}
${d.qrPng ? `<div class="c" style="margin-top:8px"><img src="${d.qrPng}" width="150" height="150" alt=""><div>Scan to pay (UPI / card)</div></div>` : ""}
<div style="font-size:10px;margin-top:6px">${d.sac ? `SAC ${d.sac} · ` : ""}${lab.stateName ? `Place of supply: ${lab.stateName} (${d.restaurant.stateCode}) · ` : ""}Reverse charge: No</div>${comp ? `<div class="b" style="font-size:10px">${COMPOSITION_NOTE}</div>` : ""}
<hr><div class="c">${d.footer ?? "Thank you, visit again"}</div>`; };
export const kotHtml = (d: KotData) => `
<h1>${d.reprint ? "KOT (REPRINT)" : "KOT"}</h1>${d.station ? `<div class="c">${d.station}</div>` : ""}<hr>
<div class="big">${d.tableOrType}</div><div class="r"><span>${d.kotNo}</span><span>${d.when}</span></div>${d.waiter ? `<div>Waiter: ${d.waiter}</div>` : ""}<hr>
${d.items.map((i) => `<div class="big">${i.qty} &nbsp; ${i.name}</div>${i.note ? `<div>&gt; ${i.note.toUpperCase()}</div>` : ""}`).join("")}<hr>`;
