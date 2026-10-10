/**
 * One CSV cell, quoted. A cell that starts with = + - @ (or a tab / carriage return) is read by Excel
 * and Google Sheets as a formula — and customer names arrive from public storefront orders, so a name
 * like `=HYPERLINK(...)` would run when the owner opened the export. Such text gets a leading
 * apostrophe; a plain number (including a negative one, -12.50) is left as a number.
 */
export const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
