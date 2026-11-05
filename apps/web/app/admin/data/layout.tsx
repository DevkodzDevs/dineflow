import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { DataShell } from "./DataShell";
import type { DataServer } from "./types";

/**
 * Master control → Data (0172 / 0173). The frame every Data page shares: the Server connection key (which server Back up
 * now, the nightly and Restore use — the cloud, your own server or your laptop) and the rail of sections. Each page reads
 * its own figures; the slow work goes to /api/admin/data; the settings to ./actions. All through 0172/0173's master-only
 * functions — the route being under /admin is not a permission.
 */
export const dynamic = "force-dynamic";
export default async function DataLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const s = await createClient();
  const { data, error } = await s.rpc("data_servers_get");
  if (error) {
    return (
      <div>
        <div className="eyebrow">Platform</div>
        <h1 className="text-[34px] md:text-[44px] mt-1 leading-none">Data <em>&amp; servers</em></h1>
        <div className="card mt-6 p-5 text-[14px]" data-data-missing>
          <b>Data needs migrations 0172 and 0173.</b> <span className="text-[var(--color-label-2)]">{/function .* does not exist|schema cache|relation .* does not exist/i.test(error.message) ? "Apply them, then open this page again." : error.message}</span>
        </div>
      </div>
    );
  }
  return <DataShell servers={(data ?? []) as DataServer[]} at={new Date().toISOString()}>{children}</DataShell>;
}
