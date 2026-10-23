import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { methodsFor, subjectFromSession, todayFor } from "@/lib/attendance";
import { serviceRoleConfigured } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/shell/PageHeader";
import { PunchPanel } from "@/components/attendance/PunchPanel";
export const metadata = { title: "My attendance" };
export const dynamic = "force-dynamic";

/** A staff member punching themselves in from their own phone — by fingerprint / Face ID or selfie. */
export default async function MyAttendancePage() {
  const session = await requireSession();
  if (session.actingAs) redirect("/dashboard");   // Master control has no attendance of its own here
  if (!serviceRoleConfigured()) return <><PageHeader eyebrow="Your day" title="My attendance" /><NotReady /></>;
  const sub = await subjectFromSession().catch(() => null);
  if (!sub) redirect("/dashboard");
  const [m, t] = await Promise.all([methodsFor(sub.restaurant), todayFor(sub)]);
  return (
    <>
      <PageHeader eyebrow="Your day" title="My attendance" sub="Punch in on arrival, out on leaving" />
      <PunchPanel token={null} name={sub.name} property={sub.property} methods={m.methods} today={t.today} passkeys={t.passkeys} locationSet={m.lat != null && m.lng != null} />
    </>
  );
}

function NotReady() {
  return (
    <div className="mx-auto max-w-[460px] feather p-6 text-center" data-not-ready>
      <h1 className="text-xl font-semibold">Phone attendance is not on yet</h1>
      <p className="mt-2 text-sm text-[var(--color-label-2)]">Use your badge, or ask your manager</p>
    </div>
  );
}
