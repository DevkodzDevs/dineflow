"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { makeTranslator, isPluralTail, DATE_WORDS, type Dict, type Translate } from "@/lib/i18n/engine";
import { DICT_URL } from "@/lib/i18n/files";
import { ENGLISH_ONLY, LANG_EVENT } from "@/lib/i18n/scope";
import { LANG_COOKIE, readLang, allOf } from "@/lib/say";

/**
 * The whole app in Tamil or Hindi (the device's `df-lang` cookie set to "ta-all" / "hi-all").
 *
 * The screens are written in English, and stay that way: this walks what is on the page and puts the
 * chosen language over every piece of English the dictionary knows — text, and the placeholder, title,
 * aria-label and alt of an element — then keeps watching, so whatever React draws next (a new screen, a
 * toast, a live count) is translated before it paints. Switching back puts the English back exactly.
 *
 * Left alone: anything inside [translate="no"] (the language menus, which show each choice in its own
 * script so a person can always find their way back), form fields' typed values, printed receipts, and
 * the pages in ENGLISH_ONLY. Names, dishes, rooms and amounts are not in the dictionary, so they stay.
 */
const SKIP = "script,style,noscript,textarea,code,pre,[translate=no],.notranslate,[contenteditable=true],[data-receipt],.receipt";
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
type Rec = { src: string; out: string };

declare global { interface Window { __dfDict?: { lang: string; p: Promise<Dict | null> } } }
const loaded: Partial<Record<"ta" | "hi", Promise<Translate | null>>> = {};
function translatorFor(l: "ta" | "hi"): Promise<Translate | null> {
  if (!loaded[l]) {
    const pre = typeof window !== "undefined" && window.__dfDict?.lang === l ? window.__dfDict.p : null;
    const p = pre ?? fetch(DICT_URL[l]).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    loaded[l] = p.then((d: Dict | null) => (d ? makeTranslator({ ...d, words: { ...DATE_WORDS[l], ...(d.words ?? {}) } }) : null));
    loaded[l]!.then((t) => { if (!t) delete loaded[l]; });   // a failed fetch is tried again next time
  }
  return loaded[l]!;
}

const texts = new WeakMap<Text, Rec>();
const attrs = new WeakMap<Element, Partial<Record<string, Rec>>>();
const skipped = (el: Element | null) => !!el?.closest(SKIP);

/* Hydration. On a full page load React adopts the server's HTML piece by piece — a part that streams in
   late is adopted late — and a piece whose text has already changed under it is thrown away and drawn
   again (React error 418, measured on the first run of langtheme.mjs). So until every piece is adopted,
   text whose element React has not reached yet waits in `later`, and is translated as soon as React has
   it. An adopted element carries React's own "__reactFiber$…" key; anything React draws afresh is born
   with it. After ADOPT_MS everything left is translated regardless. */
const ADOPT_MS = 8000;
let fiberKey: string | null = null;
let adopting = true;
const later = new Set<Node>();
/* Checked on the text node itself, not only its element: a piece that hydrates late can sit directly inside an
   element React already holds (a Suspense boundary is a pair of comments, not an element) — React tags every
   text node it adopts too. */
const adopted = (n: Node | null) => {
  if (!adopting || !n) return true;
  if (!fiberKey) fiberKey = Object.keys(document.body).find((k) => k.startsWith("__reactFiber$")) ?? null;
  if (!fiberKey) return false;
  if (fiberKey in n) return true;
  // an element whose only child is its text (`<h1>Work</h1>`) holds that text as a prop: the text node itself
  // is never tagged, so it counts as adopted with its element
  const p = n.nodeType === Node.TEXT_NODE ? n.parentElement : null;
  return !!p && fiberKey in p && p.childNodes.length === 1;
};

function doText(n: Text, tr: Translate) {
  if (!adopted(n)) { later.add(n); return; }
  const v = n.nodeValue ?? ""; const r = texts.get(n);
  if (r && v === r.out) return;
  if (isPluralTail(v)) {
    // React's server HTML puts a <!-- --> between neighbouring pieces of text ("5", " item", "s"): step over it
    let prev = n.previousSibling; while (prev && prev.nodeType === Node.COMMENT_NODE) prev = prev.previousSibling;
    if (prev instanceof Text && texts.get(prev)?.out === prev.nodeValue) { texts.set(n, { src: v, out: "" }); n.nodeValue = ""; }
    return;
  }
  const out = tr(v);
  if (out == null) { if (r) texts.delete(n); return; }
  texts.set(n, { src: v, out }); n.nodeValue = out;
}
/** A page heading drawn in two pieces — "Front" and an accented "desk" (PageHeader's title + accent) — is one
 *  phrase in Tamil or Hindi: the whole goes in the first piece and the rest is left empty. */
function doWhole(el: Element, tr: Translate) {
  if (!/^H[1-3]$/.test(el.tagName) || !el.querySelector("em")) return;
  const nodes: Text[] = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
  if (nodes.length < 2) return;
  const orig = (n: Text) => { const r = texts.get(n); return r && r.out === n.nodeValue ? r.src : n.nodeValue ?? ""; };
  const out = tr(nodes.map(orig).join(""));
  if (out == null) return;
  nodes.forEach((n, i) => { const src = orig(n); const o = i === 0 ? out.trim() : ""; texts.set(n, { src, out: o }); if (n.nodeValue !== o) n.nodeValue = o; });
}
function doEl(el: Element, tr: Translate) {
  if (!adopted(el)) { later.add(el); return; }
  doWhole(el, tr);
  for (const a of ATTRS) {
    const v = el.getAttribute(a); if (!v) continue;
    const got = attrs.get(el); if (got?.[a]?.out === v) continue;
    const out = tr(v); if (out == null) continue;
    const rec = got ?? {}; rec[a] = { src: v, out }; attrs.set(el, rec); el.setAttribute(a, out);
  }
}
function walk(root: Node, tr: Translate) {
  if (root.nodeType === Node.TEXT_NODE) { if (!skipped(root.parentElement)) doText(root as Text, tr); return; }
  if (root.nodeType !== Node.ELEMENT_NODE || skipped(root as Element)) return;
  doEl(root as Element, tr);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === Node.TEXT_NODE) doText(n as Text, tr); else doEl(n as Element, tr); }
}
/** Puts every translated piece back to the English it was. */
function revert() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) { const r = texts.get(n as Text); if (r) { if (n.nodeValue === r.out) n.nodeValue = r.src; texts.delete(n as Text); } }
    else { const rec = attrs.get(n as Element); if (rec) { for (const [a, r] of Object.entries(rec)) if (r && (n as Element).getAttribute(a) === r.out) (n as Element).setAttribute(a, r.src); attrs.delete(n as Element); } }
  }
}

const readCookie = () => readLang(document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]+)`))?.[1]);
const afterHydration = () => new Promise<void>((done) => {
  // a server-drawn piece of a page that React has not adopted yet must still read as the server wrote it,
  // or React throws it away and draws it again; the page is complete and idle by the time this resolves
  const idle = () => ("requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback(() => done(), { timeout: 400 }) : setTimeout(done, 60));
  if (document.readyState === "complete") idle(); else addEventListener("load", idle, { once: true });
});

let hydrated = false;
export function FullLanguage() {
  const path = usePathname();
  const ctl = useRef<(() => void) | null>(null);
  useEffect(() => {
    const html = document.documentElement;
    let active: "ta" | "hi" | null = null; let seq = 0; let stop = () => {};
    const off = () => { stop(); stop = () => {}; revert(); active = null; html.lang = "en"; html.removeAttribute("data-lang-all"); html.removeAttribute("data-lang-pending"); };
    /* One watcher for the whole visit: a new screen is translated by it as React draws it, before it paints.
       A change of page only asks whether this page is one that stays in English. */
    const run = async () => {
      const l = allOf(readCookie());
      const want = l && !ENGLISH_ONLY.test(location.pathname) ? l : null;
      if (want === active) return;
      const my = ++seq;
      if (!want) { off(); return; }
      if (active) off();
      active = want; html.lang = want; html.setAttribute("data-lang-all", want);
      const tr = await translatorFor(want);
      if (!hydrated) { await afterHydration(); hydrated = true; }
      if (my !== seq) return;
      if (!tr) { active = null; html.removeAttribute("data-lang-pending"); return; }
      let title = { src: "", out: "" };
      const doTitle = () => { const cur = document.title; if (!cur || cur === title.out) return; const out = cur.split(" · ").map((p) => tr(p) ?? p).join(" · "); title = { src: cur, out }; if (out !== cur) document.title = out; };
      walk(document.body, tr); doTitle();
      html.removeAttribute("data-lang-pending");
      // the pieces React had not adopted yet: picked up the moment it has them
      const t0 = Date.now();
      const sweep = setInterval(() => {
        const done = Date.now() - t0 > ADOPT_MS; if (done) adopting = false;
        for (const n of [...later]) {
          if (!n.isConnected) { later.delete(n); continue; }
          if (done || adopted(n)) { later.delete(n); if (n.nodeType === Node.TEXT_NODE) doText(n as Text, tr); else doEl(n as Element, tr); }
        }
        if (done || (!later.size && Date.now() - t0 > 1500)) { clearInterval(sweep); adopting = false; }
      }, 120);
      const mo = new MutationObserver((recs) => {
        for (const r of recs) {
          if (r.type === "characterData") { if (!skipped((r.target as Text).parentElement)) doText(r.target as Text, tr); }
          else if (r.type === "childList") r.addedNodes.forEach((n) => walk(n, tr));
          else if (r.type === "attributes" && !skipped(r.target as Element)) doEl(r.target as Element, tr);
        }
        doTitle();
      });
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
      // React puts the server's <html lang="en"> back when it rebuilds a page; keep the chosen one
      const keep = new MutationObserver(() => { if (html.lang !== want) html.lang = want; if (html.getAttribute("data-lang-all") !== want) html.setAttribute("data-lang-all", want); });
      keep.observe(html, { attributes: true, attributeFilter: ["lang", "data-lang-all"] });
      const tick = setInterval(doTitle, 1500);
      stop = () => { mo.disconnect(); keep.disconnect(); clearInterval(tick); clearInterval(sweep); later.clear(); };
    };
    // only the first load can meet text React has not adopted yet; a later page change or a choice in the menu cannot
    ctl.current = () => { if (hydrated) adopting = false; void run(); };
    void run();
    const onChange = () => { adopting = false; void run(); };
    addEventListener(LANG_EVENT, onChange);
    return () => { seq++; stop(); removeEventListener(LANG_EVENT, onChange); ctl.current = null; };
  }, []);
  useEffect(() => { ctl.current?.(); }, [path]);
  return null;
}
