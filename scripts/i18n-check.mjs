#!/usr/bin/env node
/**
 * The Tamil and Hindi dictionaries behind the whole-app languages (components/ui/FullLanguage.tsx).
 *
 *   node scripts/i18n-check.mjs                 coverage: every on-screen English string in the staff app,
 *                                              and which ones the dictionaries do not have yet
 *   node scripts/i18n-check.mjs --missing f.json   …and writes the missing ones to f.json, ready to translate
 *   node scripts/i18n-check.mjs --merge f.json     adds translations — { "English": { "ta": "…", "hi": "…" } },
 *                                              a key with {0} {1}… is a template — to both dictionaries, writes
 *                                              them under new content-hashed names in apps/web/public/i18n/ (the old
 *                                              ones are deleted — rebuild the app after a merge) and
 *                                              points apps/web/lib/i18n/files.ts at them
 *
 * What counts as on-screen English: JSX text, the user-facing JSX attributes (label, title, placeholder,
 * aria-label, hint…), string literals that read like words, and template literals (as templates). Left
 * out, as English by design: the legal pages, Master control, the API, the guest-facing pages, AI prompts,
 * the recipe seed data, Tally ledger names, printed receipts. Add a new screen's strings by running
 * --missing, translating the file by docs/i18n-brief.md (rules and glossary), and --merge.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps/web");
const ts = createRequire(path.join(ROOT, "package.json"))("typescript");
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

/* ── extraction ── */
const DIRS = ["apps/web/app", "apps/web/components", "apps/web/lib", "packages/shared/src"];
const EXCLUDE = /apps\/web\/app\/(legal|admin|api|dine|book|pay|track|ride|record|get|checkin|kiosk|feedback|queue|screen|offline|blog)\/|lib\/site\/posts\.ts$|recipes\.ts$|lib\/(ai|marketing|company|dishPhotos|tally|splash)\.ts$|lib\/i18n\/|lib\/assist\/|components\/receipt\/|apps\/web\/app\/(page|robots|sitemap|manifest|not-found|global-error)\.tsx?$|\.test\.tsx?$|\.d\.ts$/;
const files = [];
const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!/node_modules|\.next/.test(f.name)) walk(p); } else if (/\.(tsx|ts)$/.test(f.name)) { const rel = path.relative(ROOT, p).split(path.sep).join("/"); if (!EXCLUDE.test(rel)) files.push(p); } } };
DIRS.forEach((d) => walk(path.join(ROOT, d)));
const ENT = { "&apos;": "'", "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&rsquo;": "’", "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”", "&hellip;": "…", "&times;": "×", "&middot;": "·", "&rarr;": "→", "&larr;": "←", "&bull;": "•", "&#39;": "'" };
const decode = (s) => s.replace(/&[a-z#0-9]+;/gi, (m) => ENT[m] ?? m);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const SKIP_ATTR = /^(className|class|href|src|id|key|type|name|role|style|method|inputMode|autoComplete|target|rel|lang|dir|htmlFor|d|viewBox|fill|stroke\w*|xmlns|accept|pattern|encType|action|as|sizes|media|crossOrigin|referrerPolicy|loading|decoding|fetchPriority|form|list|step|min|max|value|defaultValue|enterKeyHint|capture|w|tag|variant|size|tone|icon|kind|mode|layout|align|side|color|width|height|x|y|cx|cy|r|rx|ry|x1|x2|y1|y2|points|transform|offset|stopColor|gradientUnits|fontFamily|sandbox|allow|prefetch|scroll|replace|translate|data-[a-z-]+|aria-(?!label$)[a-z]+)$/;
const looksUI = (s) => {
  if (s.length < 2 || !/[A-Za-z]/.test(s) || /^use (client|server)$/.test(s)) return false;
  if (/^(https?:|\/|\.\/|#|mailto:|tel:|data:|@|\w+:\/\/)/.test(s)) return false;
  if (/^[a-z0-9_.:\-/[\]()%#,>+=*!@]+$/.test(s) && !/ /.test(s)) return false;
  if (/(^|\s)(flex|grid|px-|py-|p-\d|m[trblxy]?-|text-\[|bg-\[|rounded|w-|h-|min-|max-|gap-|items-|justify-|border|shadow|ring|hover:|focus:|sm:|md:|lg:|xl:|2xl:|!|absolute|relative|inline|hidden|block|truncate|font-|leading-|tracking-|opacity-|z-\d|top-|left-|right-|bottom-|inset|overflow|col-|row-|space-|divide-|transition|duration|ease|select-|pointer-|cursor-|whitespace|break-|shrink|grow|order-|self-|place-|aspect-|object-|translate|scale|rotate|animate|sr-only|uppercase|lowercase|capitalize|italic|underline|tabular|antialiased|outline|fill-|stroke-)/.test(s) && !/[.?!]$/.test(s)) return false;
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(s)) return false;
  if (/^[A-Z0-9_]+$/.test(s) && s.length > 1 && !/^[A-Z]{2,5}$/.test(s)) return false;
  if (/^[a-z]+$/.test(s)) return false;
  if (/^\d|^[^A-Za-z₹"'(“‘]/.test(s) && !/ /.test(s)) return false;
  // a semicolon inside a sentence ("accept them quickly; the kitchen…") is words; one between CSS rules is not
  if ((/[{}<>=]|\\n|=>|\$\{/.test(s) || /;\S/.test(s) || /:\s*[^\s;]+;/.test(s)) && !/[.?!]$/.test(s)) return false;
  return true;
};
const strings = new Set(); const templates = new Set();
for (const f of files) {
  const sf = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isJsxText(n)) { const t = norm(decode(n.getText(sf))); if (t && /[A-Za-z]/.test(t)) strings.add(t); }
    else if (ts.isJsxAttribute(n)) { const nm = n.name.getText(sf); if (SKIP_ATTR.test(nm)) return; if (n.initializer && ts.isStringLiteral(n.initializer)) { const t = norm(n.initializer.text); if (looksUI(t)) strings.add(t); } }
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      if (p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isElementAccessExpression(p) || ts.isCaseClause(p) || (ts.isPropertyAssignment(p) && p.name === n))) return;
      if (p && ts.isBinaryExpression(p) && /===|!==|==|!=/.test(p.operatorToken.getText(sf))) return;
      // a query, a key, a selector or a format — not words for a person
      if (p && ts.isCallExpression(p) && /^(require|import|rpc|from|select|eq|neq|order|in|is|match|ilike|like|gte|lte|gt|lt|or|filter|range|revalidatePath|redirect|getElementById|querySelector|querySelectorAll|closest|matches|startsWith|endsWith|includes|split|replace|get|has|delete|set|getAll|addEventListener|removeEventListener|dispatchEvent|setAttribute|getAttribute|removeAttribute|toLocaleString|toLocaleDateString|toLocaleTimeString|Intl|DateTimeFormat|NumberFormat|cookies|headers|fetch|matchMedia|createElement|cn|clsx|channel|on)$/.test((p.expression.name ?? p.expression).getText(sf).split(".").pop())) return;
      const t = norm(n.text); if (looksUI(t) && !/^(en-IN|Asia\/Kolkata)$/.test(t)) strings.add(t);
    }
    else if (ts.isTemplateExpression(n)) {
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
      let i = 0; const shape = norm(parts.join("\u0001")).replace(/\u0001/g, () => `{${i++}}`);
      if (/[A-Za-z]{2,}/.test(parts.join("")) && !/(flex|grid|px-|text-\[|bg-|rounded|\/api\/|https?:|select |\.\w+\(|--|=|<)/.test(shape)) templates.add(shape);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/* ── the dictionaries now ── */
const FILES_TS = path.join(WEB, "lib/i18n/files.ts");
const current = () => {
  const src = readFileSync(FILES_TS, "utf8");
  const url = (l) => src.match(new RegExp(`${l}: "([^"]+)"`))?.[1];
  const load = (l) => { const p = path.join(WEB, "public", url(l) ?? ""); return url(l) && existsSync(p) ? { file: p, d: JSON.parse(readFileSync(p, "utf8")) } : { file: null, d: { strings: {}, patterns: [], skip: [] } }; };
  return { ta: load("ta"), hi: load("hi") };
};

if (opt("--merge")) {
  const add = JSON.parse(readFileSync(opt("--merge"), "utf8"));
  const cur = current(); const counts = {};
  for (const l of ["ta", "hi"]) {
    const d = cur[l].d; d.strings ??= {}; d.patterns ??= []; d.skip ??= [];
    const pats = new Map(d.patterns);
    for (const [en, v] of Object.entries(add)) {
      if (v === null) { if (!d.skip.includes(en)) d.skip.push(en); continue; }   // looked at, and not screen text
      const tr = v?.[l]; if (typeof tr !== "string") continue;
      if (/\{\d+\}/.test(en)) pats.set(en, tr); else d.strings[en] = tr;
    }
    d.patterns = [...pats.entries()];
    const body = JSON.stringify({ strings: d.strings, patterns: d.patterns, skip: d.skip.sort() });
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
    const name = `/i18n/${l}.${hash}.json`;
    writeFileSync(path.join(WEB, "public", name), body);
    if (cur[l].file && cur[l].file !== path.join(WEB, "public", name)) unlinkSync(cur[l].file);
    cur[l].url = name; counts[l] = Object.keys(d.strings).length + d.patterns.length;
  }
  // the old files go: a running server built against them loses its dictionaries — rebuild after a merge
  writeFileSync(FILES_TS, `/* Written by scripts/i18n-check.mjs --merge — the dictionaries' file names carry their content hash, so a\n   new translation is never served from an old cache. Do not edit by hand. */\nexport const DICT_URL = { ta: "${cur.ta.url}", hi: "${cur.hi.url}" } as const;\nexport const DICT_COUNT = { ta: ${counts.ta}, hi: ${counts.hi} } as const;\n`);
  console.log(`merged: ta ${counts.ta} entries → ${cur.ta.url} · hi ${counts.hi} entries → ${cur.hi.url}`);
}

/* ── coverage ── */
const cur = current();
const known = (l) => { const d = cur[l].d; return new Set([...Object.keys(d.strings ?? {}).map(norm), ...(d.patterns ?? []).map(([e]) => norm(e)), ...(d.skip ?? []).map(norm)]); };
const kt = known("ta"), kh = known("hi");
const missing = {};
for (const s of [...strings, ...templates]) if (!kt.has(s) || !kh.has(s)) missing[s] = { ta: kt.has(s), hi: kh.has(s) };
const total = strings.size + templates.size; const miss = Object.keys(missing).length;
console.log(`on-screen English: ${strings.size} strings + ${templates.size} templates in ${files.length} files`);
console.log(`dictionaries: ta ${kt.size} · hi ${kh.size} — covered ${total - miss} of ${total} (${((100 * (total - miss)) / total).toFixed(1)}%), missing ${miss}`);
if (opt("--missing")) { writeFileSync(opt("--missing"), JSON.stringify(Object.keys(missing), null, 1)); console.log(`missing list → ${opt("--missing")}`); }
else if (miss) console.log(Object.keys(missing).slice(0, 25).map((s) => "  · " + s).join("\n") + (miss > 25 ? `\n  … and ${miss - 25} more (--missing f.json for all)` : ""));
