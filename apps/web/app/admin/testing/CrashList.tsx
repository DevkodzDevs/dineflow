/**
 * Master control → Testing: the crashes people actually saw (0149, 2026-10-29 — the owner's Stage 2 "error reporting").
 * Every time a screen fell to "This screen did not load", the browser reported what broke; the same error on the same page
 * within a day is one row with a count. A *crash* is a bug to fix; an *old tab* was open across a deploy and reloaded
 * itself. Server-rendered: nothing to run, it is read with the page.
 */
export type Crash = { id: number; kind: "crash" | "stale"; path: string; name: string | null; message: string | null; digest: string | null; ua: string | null; count: number; first_at: string; last_at: string; restaurant: string | null };

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
/** the browser in a few words: "Safari · iPhone", "Chrome · Android" */
const device = (ua: string | null) => {
  if (!ua) return null;
  const b = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const d = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : null;
  return d ? `${b} · ${d}` : b;
};

export function CrashList({ rows }: { rows: Crash[] }) {
  const crashes = rows.filter((r) => r.kind === "crash").reduce((t, r) => t + r.count, 0);
  return (
    <section className="card p-5" data-crash-list>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-2xl">Crashes people saw</h2>
        <span className="text-sm text-steel">Last 7 days · “This screen did not load” · {crashes} crash{crashes === 1 ? "" : "es"}</span>
      </div>
      {rows.length === 0 ? <p className="text-sm text-steel mt-3">None in the last 7 days.</p> : (
        <ul className="mt-4 divide-y divide-[var(--color-separator)]">
          {rows.map((r) => (
            <li key={r.id} className="py-3 flex items-start gap-3 min-w-0" data-crash={r.kind}>
              <span className={`shrink-0 mt-0.5 h-6 px-2.5 rounded-full text-[11.5px] font-bold inline-flex items-center ${r.kind === "crash" ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-orange-2)] text-[var(--color-orange)]"}`}>{r.kind === "crash" ? "Crash" : "Old tab"}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold break-words">{r.name && r.name !== "Error" ? `${r.name}: ` : ""}{r.message ?? (r.digest ? `Server error · ref ${r.digest}` : "No message")}</div>
                <div className="text-[12.5px] text-steel mt-0.5 break-words"><span className="num">{r.path}</span>{r.restaurant ? ` · ${r.restaurant}` : " · a guest page"}{device(r.ua) ? ` · ${device(r.ua)}` : ""}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-[15px] font-bold">{r.count}×</div>
                <div className="text-[11.5px] text-steel whitespace-nowrap">{ago(r.last_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
