"use client";
import { useState } from "react";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import styles from "./MasterBanner.module.css";

/** Shown to the master login while it is inside a client's property. On a phone it is one slim line (2026-10-23, the owner:
 *  the bar, the top bar and the page head stacked up): "Master mode · manoooo" and an Exit key — the long words from sm up. */
export function MasterBanner({ property }: { property: string }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div role="status" className={`no-print mt-3 mb-2 ${styles.bar}`}>
      <span className={styles.shield}><ShieldCheck size={15} aria-hidden="true" /></span>
      <span className={styles.text}>
        <span className={styles.label}>Master mode</span><span className={styles.long}> — viewing <b>{property}</b> as its owner.</span><span className={styles.short}> · <b>{property}</b></span>
        <span className={styles.note}> Everything you do here is real and logged.</span>
      </span>
      {/* a form, not an onClick: it works before the page has hydrated (see app/admin/leave/route.ts) */}
      <form action="/admin/leave" method="post" onSubmit={() => setLeaving(true)} className="contents">
        <button type="submit" className={styles.exit} disabled={leaving}
          aria-label="Leave this property and go back to Master control" data-leave>
          <ArrowLeft size={13} aria-hidden="true" />
          {leaving ? "Leaving…" : <><span className={styles.long}>Back to Master control</span><span className={styles.short}>Exit</span></>}
        </button>
      </form>
    </div>
  );
}
