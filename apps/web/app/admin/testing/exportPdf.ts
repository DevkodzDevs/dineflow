import type { Run } from "./TestingClient";

/**
 * The self-test results as a PDF, built in the browser (jsPDF, loaded only when the button is
 * pressed). A cover with the score and the totals, a table of the suites, then every check of every
 * suite with its status and what was seen — the record an owner can file or send to a developer.
 * jsPDF's built-in fonts are Latin-1, so "₹", "—", "→" and the like are swapped for plain text.
 */
const plain = (s: string) => s.replace(/₹/g, "Rs ").replace(/[—–]/g, "-").replace(/→/g, "->").replace(/[·•]/g, "|").replace(/×/g, "x").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\xFF]/g, "");

export async function exportPdf(runs: Run[], titles: Record<string, string>) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 44;
  let y = M;
  const checks = runs.flatMap((r) => r.checks);
  const n = (s: string) => checks.filter((c) => c.status === s).length;
  const judged = n("pass") + n("warn") + n("fail");
  const score = judged ? Math.round(((n("pass") + n("warn") * 0.5) / judged) * 100) : 0;
  const colour = (s: string): [number, number, number] => s === "pass" ? [31, 168, 74] : s === "warn" ? [214, 130, 20] : s === "fail" ? [214, 48, 49] : [130, 130, 140];
  const newPage = () => { doc.addPage(); y = M; };
  const need = (h: number) => { if (y + h > H - M) newPage(); };

  // ── cover band ──
  doc.setFillColor(13, 14, 18); doc.rect(0, 0, W, 132, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text("DineFlow self-test report", M, 58);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(180, 180, 190);
  doc.text(plain(`Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST  |  ${runs.length} suites  |  ${checks.length} checks`), M, 80);
  // score circle
  const cx = W - M - 46, cy = 66;
  doc.setDrawColor(60, 60, 70); doc.setLineWidth(7); doc.circle(cx, cy, 38, "S");
  doc.setDrawColor(...colour(n("fail") ? "fail" : n("warn") ? "warn" : "pass")); doc.circle(cx, cy, 38, "S");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text(`${score}`, cx, cy + 4, { align: "center" });
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.text("HEALTH", cx, cy + 16, { align: "center" });
  y = 160;

  // ── totals ──
  const tiles: [string, number, string][] = [["Passed", n("pass"), "pass"], ["Warnings", n("warn"), "warn"], ["Failed", n("fail"), "fail"], ["Skipped", n("skip"), "skip"]];
  const tw = (W - M * 2 - 30) / 4;
  tiles.forEach(([label, v, s], i) => {
    const x = M + i * (tw + 10);
    doc.setFillColor(246, 246, 243); doc.roundedRect(x, y, tw, 58, 8, 8, "F");
    doc.setFillColor(...colour(s)); doc.roundedRect(x, y, 5, 58, 2, 2, "F");
    doc.setTextColor(20, 20, 24); doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text(String(v), x + 16, y + 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100, 100, 110); doc.text(label, x + 16, y + 46);
  });
  y += 84;

  // ── suites table ──
  doc.setTextColor(20, 20, 24); doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("Suites", M, y); y += 14;
  doc.setFontSize(8.5); doc.setTextColor(110, 110, 120);
  const cols = [M, M + 190, M + 260, M + 330, M + 390, M + 445];
  ["Suite", "Status", "Passed", "Warn", "Failed", "Time / ran"].forEach((h, i) => doc.text(h, cols[i], y + 10));
  y += 16; doc.setDrawColor(225, 225, 220); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  for (const r of runs) {
    need(22); y += 15;
    const c = (s: string) => r.checks.filter((x) => x.status === s).length;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20, 20, 24); doc.text(plain(titles[r.suite] ?? r.suite), cols[0], y);
    doc.setTextColor(...colour(r.status)); doc.text(r.status === "pass" ? "Pass" : r.status === "warn" ? "Warnings" : "Failing", cols[1], y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 46);
    doc.text(String(c("pass")), cols[2], y); doc.text(String(c("warn")), cols[3], y); doc.text(String(c("fail")), cols[4], y);
    doc.text(plain(`${r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`} | ${new Date(r.ran_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`), cols[5], y);
    y += 7; doc.setDrawColor(238, 238, 234); doc.line(M, y, W - M, y);
  }

  // ── every check ──
  for (const r of runs) {
    need(60); y += 30;
    doc.setFillColor(...colour(r.status)); doc.circle(M + 4, y - 4, 4, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(20, 20, 24); doc.text(plain(titles[r.suite] ?? r.suite), M + 14, y);
    y += 8;
    for (const c of r.checks) {
      // three columns: the status chip, the check's name (wraps in 165pt), what was seen (the rest)
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      const name = doc.splitTextToSize(plain(c.name), 165) as string[];
      const detail = c.detail ? doc.splitTextToSize(plain(c.detail + (typeof c.ms === "number" && !/ms/.test(c.detail) ? ` | ${c.ms} ms` : "")), W - M * 2 - 230) as string[] : [];
      const lines = Math.max(name.length, detail.length, 1);
      const h = 10 + lines * 11;
      need(h + 2);
      if ((r.checks.indexOf(c) % 2) === 1) { doc.setFillColor(248, 248, 246); doc.rect(M - 4, y + 2, W - M * 2 + 8, h, "F"); }
      y += 14;
      const [cr, cg, cb] = colour(c.status);
      doc.setFillColor(cr, cg, cb); doc.roundedRect(M, y - 9, 40, 13, 3, 3, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      doc.text(c.status.toUpperCase(), M + 20, y - 0.5, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(20, 20, 24);
      doc.text(name, M + 52, y);
      doc.setFont("helvetica", "normal"); doc.setTextColor(90, 90, 100);
      if (detail.length) doc.text(detail, M + 228, y);
      y += (lines - 1) * 11 + (h - 14 - (lines - 1) * 11);
    }
  }

  // ── footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150, 150, 158);
    doc.text("DineFlow  |  Master control > Testing", M, H - 22); doc.text(`Page ${p} of ${pages}`, W - M, H - 22, { align: "right" });
  }
  const stamp = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  doc.save(`dineflow-self-test-${stamp}.pdf`);
}
