import { Loader, Skeleton } from "@/components/ui";
/** The shape of a screen before it arrives: the board searching where the tiles will be, rows where the rows will be. */
export default function Loading() {
  return (
    <div className="loader-in" role="status" aria-label="Loading">
      <div className="mb-8"><Skeleton className="h-3 w-28 mb-3" /><Skeleton className="h-11 w-64" /><Skeleton className="h-3 w-80 mt-3" /><div className="hairline mt-6" /></div>
      <div className="flip-row mb-8"><Loader size="md" /><span className="flip sm opacity-40" aria-hidden><span className="flip-face"> </span></span><span className="flip sm opacity-25" aria-hidden><span className="flip-face"> </span></span></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="group lg:col-span-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel-row"><span className="shimmer" /><span className="shimmer" style={{ maxWidth: `${40 + (i * 13) % 30}%` }} /><span className="shimmer" /></div>)}</div>
        <div className="card p-6"><Skeleton className="h-5 w-32 mb-4" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full mb-3" />)}</div>
      </div>
    </div>
  );
}
