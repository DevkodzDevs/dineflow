"use client";
import { useId, useRef } from "react";
import { Info, LogIn, MoreHorizontal, SlidersHorizontal, Settings2, Trash2 } from "lucide-react";
import styles from "./RowActions.module.css";

type Props = {
  name: string;
  code: string | null;
  pending: boolean;
  onOpen: () => void;
  onDetails: () => void;
  onAccess: () => void;
  onManage: () => void;
  onDelete: () => void;
};

/**
 * The actions on one row of the estate table.
 *
 * Open is the thing an operator reaches for, so it is the only button with weight. The rest sit
 * behind one control, which keeps five buttons' worth of width out of every row and puts a rule and
 * a colour between Delete and everything else.
 *
 * The menu uses the platform popover, so it renders in the top layer: the table scrolls
 * horizontally, and an absolutely positioned menu would be cut off at the cell's edge. Light
 * dismiss, Escape and focus return come with it rather than being rebuilt.
 */
export function RowActions({ name, code, pending, onOpen, onDetails, onAccess, onManage, onDelete }: Props) {
  const id = useId().replace(/:/g, "");
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  /** Pin the menu to the trigger, flipping up or in when the edge of the window is close. */
  const place = () => {
    const m = menu.current, t = trigger.current;
    if (!m || !t) return;
    const r = t.getBoundingClientRect();
    const w = m.offsetWidth || 268, h = m.offsetHeight || 260, gap = 6;
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    const below = window.innerHeight - r.bottom;
    const top = below < h + gap && r.top > h + gap ? r.top - h - gap : r.bottom + gap;
    m.style.left = `${left}px`;
    m.style.top = `${Math.max(8, top)}px`;
  };

  const run = (fn: () => void) => () => { menu.current?.hidePopover(); fn(); };

  /** Up and down walk the menu; Home and End jump. Everything else is the popover's own. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const go = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length].focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
  };

  const Item = ({ icon, label, hint, onClick, danger }:
    { icon: React.ReactNode; label: string; hint: string; onClick: () => void; danger?: boolean }) => (
    <button type="button" role="menuitem" disabled={pending} onClick={run(onClick)}
      className={danger ? `${styles.item} ${styles.danger}` : styles.item}>
      {icon}
      <span className={styles.itemText}>
        <span className={styles.itemLabel}>{label}</span>
        <span className={styles.itemHint}>{hint}</span>
      </span>
    </button>
  );

  return (
    <div className={styles.row}>
      <button type="button" className={styles.open} disabled={pending} onClick={onOpen}
        title={`Open ${name} in a new tab`}>
        <LogIn size={14} /> Open
      </button>

      <button ref={trigger} type="button" className={styles.more} disabled={pending}
        popoverTarget={id} aria-haspopup="menu" aria-label={`More actions for ${name}`}
        title={`More actions for ${name}`}>
        <MoreHorizontal size={17} />
      </button>

      <div ref={menu} id={id} popover="auto" role="menu" className={styles.menu}
        onKeyDown={onKeyDown}
        onBeforeToggle={(e) => { if ((e as unknown as { newState: string }).newState === "open") place(); }}>
        <div className={styles.head}>
          <div className={styles.headName}>{name}</div>
          {code && <div className={styles.headCode}>{code}</div>}
        </div>
        <Item icon={<Info size={15} />} label="Details"
          hint="The full record: logins, tax registration, what it holds" onClick={onDetails} />
        <Item icon={<SlidersHorizontal size={15} />} label="Access"
          hint="Which parts of the app this property can open" onClick={onAccess} />
        <Item icon={<Settings2 size={15} />} label="Manage"
          hint="Membership, keys, passwords and the contact address" onClick={onManage} />
        <Item icon={<Trash2 size={15} />} label="Delete property"
          hint="Removes it, everything in it and its logins" onClick={onDelete} danger />
      </div>
    </div>
  );
}
