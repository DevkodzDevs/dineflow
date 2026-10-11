"use client";
import { useEffect, useState, useTransition } from "react";
import { Button, Sheet, cn } from "@/components/ui";

/**
 * "Why?" before something that costs money is undone — a void, a cancelled order, a cancelled dish.
 * The quick chips are the reasons a floor actually has; a tap fills the box, and the box can still be
 * edited. The server refuses an empty reason (0087), so the button stays off until there is one.
 */
export function ReasonDialog({ open, onClose, title, hint, chips, confirmLabel, onConfirm }: {
  open: boolean; onClose: () => void; title: string; hint?: string; chips: string[]; confirmLabel: string;
  onConfirm: (reason: string) => Promise<{ error?: string | null } | void>;
}) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { if (open) { setReason(""); setErr(null); } }, [open]);
  const ok = reason.trim().length >= 3;
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-4" data-reason-dialog>
        {hint && <p className="text-sm text-[var(--color-label-2)]">{hint}</p>}
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => <button key={c} type="button" onClick={() => { setReason(c); setErr(null); }} className={cn("chip", reason === c && "on")}>{c}</button>)}
        </div>
        <textarea value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} rows={2} maxLength={160} placeholder="Reason — a few words" aria-label="Reason" autoFocus />
        {err && <p className="text-sm text-[var(--color-red)]">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Keep it</Button>
          <Button type="button" variant="danger" disabled={!ok || pending} loading={pending} data-confirm
            onClick={() => start(async () => { const r = await onConfirm(reason.trim()); if (r && r.error) setErr(r.error); else onClose(); })}>{confirmLabel}</Button>
        </div>
      </div>
    </Sheet>
  );
}
