/** Who may switch a dish on or off online (0132, set_online_available): the owner, a manager, a chef, or a supervisor
 *  of either rank who holds the Online orders section. Mirrors the RPC's own check, so a screen shows the switches only
 *  to someone the database will let through; everyone else sees the list read-only. */
export function canSetOnline(role: string, modules: string[]): boolean {
  if (["owner", "manager", "chef"].includes(role)) return true;
  return (role === "supervisor" || role === "supervisor_2") && modules.includes("online-orders");
}
