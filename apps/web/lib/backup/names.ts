/** Tables never restored from a backup — the database refuses them too (0172 / 0173). No Node modules, so a page may import it. */
export const NOT_RESTORED_NAMES = new Set(["_dineflow_migrations", "platform_admins", "admin_context", "admin_session_context", "outlet_session",
  "rate_hits", "feedback_ip_hits", "data_backups", "data_settings", "storage_snapshots", "data_servers", "data_node_commands", "data_node_files",
  "temp_passwords", "password_otps", "contact_otps", "sync_state"]);
