/**
 * A plain report as a PDF, built in the browser (jsPDF, loaded only when the button is pressed): a dark title band,
 * then each table under its heading — a grey header row, hairlines, numbers right-aligned, a new page with the header
 * repeated when a table runs over. jsPDF's built-in fonts are Latin-1, so "₹", "—" and the like become plain text.
 */
export type Table = { title: string; head: string[]; rows: (string | number | null)[][]; widths?: number[]; right?: number[]; note?: string };

export const plain = (s: string) => s.replace(/₹/g, "Rs ").replace(/[—–]/g, "-").replace(/→/g, "->").replace(/[·•]/g, "|").replace(/×/g, "x")
  .replace(/★/g, "*").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\xFF]/g, "");
const cell = (v: string | number | null) => (v === null || v === undefined ? "" : typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : plain(String(v)));

/** `summary` (Assist's documents, 2026-10-21): a paragraph under the title band, before the first table. */
export async function tablesPdf(title: string, subtitle: string, tables: Table[], opts: { summary?: string } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  doc.setFillColor(13, 14, 18); doc.rect(0, 0, W, 92, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text(plain(title), M, 46);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(180, 180, 190); doc.text(plain(subtitle), M, 68);
  let y = 122;
  if (opts.summary?.trim()) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20, 20, 24); doc.text("Summary", M, y); y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(45, 45, 52);
    for (const para of opts.summary.replace(/\r/g, "").split(/\n+/)) {   // split first: plain() drops newlines
      for (const line of doc.splitTextToSize(plain(para), W - 2 * M) as string[]) { if (y + 14 > H - M) { doc.addPage(); y = M + 10; } doc.text(line, M, y); y += 14; }
      y += 6;
    }
    y += 16;
  }
  const foot = () => { const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(140, 140, 150); doc.text(`${plain(title)}  |  page ${i} of ${n}`, M, H - 20); } };
  for (const t of tables) {
    const n = t.head.length; const total = (t.widths ?? t.head.map((_, i) => (i === 0 ? 3 : 1.4))).slice(0, n);
    const sum = total.reduce((a, b) => a + b, 0); const ws = total.map((w) => ((W - 2 * M) * w) / sum);
    const xs = ws.map((_, i) => M + ws.slice(0, i).reduce((a, b) => a + b, 0));
    const right = new Set(t.right ?? t.head.map((_, i) => i).filter((i) => i > 0));
    const header = () => {
      doc.setFillColor(242, 242, 238); doc.rect(M, y - 11, W - 2 * M, 17, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(90, 90, 100);
      t.head.forEach((h, i) => doc.text(plain(h), right.has(i) ? xs[i] + ws[i] - 4 : xs[i] + 4, y, { align: right.has(i) ? "right" : "left" }));
      y += 15;
    };
    if (y + 60 > H - M) { doc.addPage(); y = M + 10; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20, 20, 24); doc.text(plain(t.title), M, y); y += 8;
    if (t.note) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(110, 110, 120); doc.text(plain(t.note), M, y + 8); y += 12; }
    y += 14; header();
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    if (!t.rows.length) { doc.setTextColor(130, 130, 140); doc.text("Nothing in this period.", M + 4, y); y += 16; }
    for (const r of t.rows) {
      if (y + 14 > H - M) { doc.addPage(); y = M + 10; header(); doc.setFont("helvetica", "normal"); doc.setFontSize(9); }
      doc.setTextColor(30, 30, 36);
      r.forEach((v, i) => {
        // too wide for its column: cut it and end with a dot (the PDF font has no ellipsis)
        let s = cell(v);
        if (doc.getTextWidth(s) > ws[i] - 8) { while (s.length > 1 && doc.getTextWidth(s + ".") > ws[i] - 8) s = s.slice(0, -1); s += "."; }
        doc.text(s, right.has(i) ? xs[i] + ws[i] - 4 : xs[i] + 4, y, { align: right.has(i) ? "right" : "left" });
      });
      doc.setDrawColor(232, 232, 228); doc.setLineWidth(0.5); doc.line(M, y + 5, W - M, y + 5); y += 15;
    }
    y += 22;
  }
  foot();
  return doc.output("arraybuffer") as ArrayBuffer;
}
