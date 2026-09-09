"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { stopActing } from "@/app/admin/actions";
import styles from "./MasterBanner.module.css";

/** Shown to the master login while it is inside a client's property. */
export function MasterBanner({ property }: { property: string }) {
  const router = useRouter(); const [pending, start] = useTransition();
  return (
    <div role="status" className={`no-print mt-3 mb-2 ${styles.bar}`}>
      <span className={styles.shield}><ShieldCheck size={15} aria-hidden="true" /></span>
      <span className={styles.text}>
        <span className={styles.label}>Master mode</span> — viewing <b>{property}</b> as its owner.
        <span className={styles.note}> Everything you do here is real and logged.</span>
      </span>
      <button type="button" className={styles.exit} disabled={pending}
        aria-label="Leave this property and go back to Master control"
        onClick={() => start(async () => { await stopActing(); router.push("/admin"); })}>
        <ArrowLeft size={13} aria-hidden="true" />
        {pending ? "Leaving…" : "Back to Master control"}
      </button>
    </div>
  );
}
