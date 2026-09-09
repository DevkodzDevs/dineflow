import type { ReactNode } from "react";
export function PageHeader({ eyebrow, title, accent, actions, sub }: { eyebrow?: string; title: string; accent?: string; actions?: ReactNode; sub?: string }) {
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1 className="text-[34px] md:text-[48px] mt-1">{title}{accent && <> <em>{accent}</em></>}</h1>
          {sub && <p className="text-[var(--color-label-2)] text-[15px] mt-2 max-w-xl">{sub}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
      <div className="hairline mt-6" />
    </div>
  );
}
