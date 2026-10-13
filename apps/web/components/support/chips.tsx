import { statusOf, PRIORITIES } from "@/lib/support";
import { cn } from "@/components/ui";

/** A request's state as a tinted chip with a dot — the property reads "Sorted", Master control "Resolved". */
export function StatusChip({ status, desk, className }: { status: string; desk?: boolean; className?: string }) {
  const st = statusOf(status);
  return (
    <span className={cn("h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0", className)} data-status={status}
      style={{ background: `color-mix(in srgb, var(${st.tone}) 16%, transparent)`, color: `var(${st.tone})` }}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{desk ? st.label : st.customer}
    </span>
  );
}

const P_TONE: Record<string, string> = { low: "--color-label-3", normal: "--color-label-2", high: "--color-orange", urgent: "--color-red" };
/** Priority — quiet for low and normal, amber for high, red for urgent. */
export function PriorityChip({ priority, className }: { priority: string; className?: string }) {
  const label = PRIORITIES.find((p) => p.key === priority)?.label ?? priority;
  const tone = P_TONE[priority] ?? "--color-label-2";
  return (
    <span className={cn("h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center whitespace-nowrap shrink-0", className)} data-priority={priority}
      style={{ background: `color-mix(in srgb, var(${tone}) 14%, transparent)`, color: `var(${tone})` }}>{label}</span>
  );
}
