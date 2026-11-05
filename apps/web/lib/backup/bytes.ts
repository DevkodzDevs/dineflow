/** 72797331 → "69.4 MB". Shared by the backup engine and the page (no Node modules here, so a client may import it). */
export const fmtBytes = (n: number | null | undefined): string => {
  const v = Number(n ?? 0);
  if (v < 1024) return `${v} B`;
  const u = ["KB", "MB", "GB", "TB"]; let x = v / 1024, i = 0;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)} ${u[i]}`;
};
