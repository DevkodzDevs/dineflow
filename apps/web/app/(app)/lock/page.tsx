import { redirect } from "next/navigation";
import { modulesFor, landingFor } from "@dineflow/shared";
import { requireSession } from "@/lib/auth";
import { rowsFor, freshFor, menuGroups, deptOf } from "@/components/shell/sections";
import { lockable } from "@/lib/displayLock";
import { LockClient, type LockGroup } from "./LockClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Display lock" };

/**
 * Display lock (0141): every page this person can open, each with its lock on or off and its kind; and, for a page that
 * is on, "Lock this display". The owner's and a manager's (a General Manager's position carries the manager role) — the
 * database checks the role again on every change.
 */
export default async function LockPage() {
  const s = await requireSession();
  const role = s.profile.role;
  const mods = modulesFor(s.restaurant.property_type, role, s.restaurant.enabled_modules ?? null, s.profile.allowed_modules ?? null);
  if (role !== "owner" && role !== "manager") redirect(`/${landingFor(role, mods, s.profile.position ?? null)}`);
  const dept = deptOf(role, s.profile.department ?? null, s.profile.position ?? null);
  const rows = [...rowsFor(mods, role, s.profile.grants ?? null), ...freshFor(role, dept)].filter((r) => lockable(r.key));
  const groups: LockGroup[] = menuGroups(rows).map((g) => ({ title: g.title, items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href })) }));
  return <LockClient groups={groups} setting={s.restaurant.display_lock ?? {}} me={s.profile.full_name} />;
}
