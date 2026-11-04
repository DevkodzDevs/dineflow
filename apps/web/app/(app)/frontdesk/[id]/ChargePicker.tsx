"use client";
import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { Preset } from "./charges";
import f from "./Folio.module.css";


/**
 * What goes on the folio (2026-11-04, the owner: "a dropdown to choose from, or type it by hand"). One box: type anything, or
 * open the list — charges this property has posted before (with what they cost last time) first, then the usual ones. Picking
 * one fills the words and, when the amount box is empty, the amount it cost last time. Typing filters the list; Enter takes the
 * highlighted row, or the words as typed. Arrow keys move, Escape closes.
 */
export function ChargePicker({ value, onChange, onPick, presets, placeholder }: { value: string; onChange: (v: string) => void; onPick: (p: Preset) => void; presets: Preset[]; placeholder: string }) {
  const [open, setOpen] = useState(false); const [at, setAt] = useState(0);
  const id = useId(); const box = useRef<HTMLInputElement>(null);
  const q = value.trim().toLowerCase();
  const rows = useMemo(() => presets.filter((p) => !/^late check-?out/i.test(p.name) && (!q || p.name.toLowerCase().includes(q)))   /* 0171 posts the late fee itself */, [presets, q]);
  const exact = rows.some((p) => p.name.toLowerCase() === q);
  const own = q && !exact ? 1 : 0;   // "Use “…”" — the words as typed — comes first while they match nothing exactly
  const count = own + rows.length;
  const take = (i: number) => {
    if (own && i === 0) { setOpen(false); return; }
    const p = rows[i - own]; if (!p) return;
    onPick(p); setOpen(false);
  };
  const used = rows.filter((p) => p.used), usual = rows.filter((p) => !p.used);
  const opt = (p: Preset, i: number) => (
    <button key={p.name} id={`${id}-${i}`} type="button" role="option" aria-selected={at === i} data-active={at === i} className={f.opt}
      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAt(i)} onClick={() => take(i)} data-charge-preset={p.name}>
      <span className={f.optName}>{p.name}</span>{p.amount != null && <span className={f.optAmt}>{formatINR(p.amount, { whole: true })} last time</span>}
    </button>
  );
  return (
    <div className={f.combo} data-charge-picker>
      <input ref={box} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && count ? `${id}-${at}` : undefined}
        value={value} placeholder={placeholder} autoComplete="off" data-charge-text
        onChange={(e) => { onChange(e.target.value); setOpen(true); setAt(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setAt((a) => Math.min(count - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && open && count) { e.preventDefault(); take(at); }
          else if (e.key === "Escape") setOpen(false);
        }} />
      <button type="button" className={f.toggle} aria-label={open ? "Close the list" : "Choose from the list"} aria-expanded={open} tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()} onClick={() => { setOpen(!open); setAt(0); box.current?.focus(); }} data-charge-toggle><ChevronDown size={18} aria-hidden /></button>
      {open && count > 0 && (
        <div id={`${id}-list`} role="listbox" className={f.list} data-charge-list>
          {own > 0 && (
            <button id={`${id}-0`} type="button" role="option" aria-selected={at === 0} data-active={at === 0} className={`${f.opt} ${f.optOwn}`}
              onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setAt(0)} onClick={() => take(0)} data-charge-own>
              <Plus size={15} aria-hidden /><span className={f.optName}>Use “{value.trim()}”</span>
            </button>
          )}
          {used.length > 0 && <div className={f.group}>Used here</div>}
          {used.map((p) => opt(p, own + rows.indexOf(p)))}
          {usual.length > 0 && <div className={f.group}>Common</div>}
          {usual.map((p) => opt(p, own + rows.indexOf(p)))}
        </div>
      )}
    </div>
  );
}
