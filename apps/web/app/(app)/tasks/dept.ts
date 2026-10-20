/** A person's department as the database's `_my_dept()` (0116) reads it: the one set on them, else their role's. Shared by
 *  the page (server) and the client, so it lives outside the "use client" file. */
const BY_ROLE: Record<string, string> = { housekeeping: "housekeeping", waiter: "service", cashier: "service", chef: "kitchen", frontdesk: "front_office", store: "stores" };
export const myDept = (role: string, department: string | null | undefined): string | null => department || BY_ROLE[role] || null;
