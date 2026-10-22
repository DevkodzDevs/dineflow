import { notFound } from "next/navigation";
import { methodsFor, subjectFromToken, todayFor } from "@/lib/attendance";
import { serviceRoleConfigured } from "@/lib/supabase/admin";
import { PunchPanel } from "@/components/attendance/PunchPanel";
export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance", robots: { index: false, follow: false } };

/**
 * A labourer's own punch clock, sent to their phone as a link. No sign-in: the long random token in
 * the link is who they are (labourers.punch_token, unique per worker). The owner decides which ways
 * work here — fingerprint / Face ID, selfie + location — in Settings → Attendance.
 */
export default async function AttendPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!serviceRoleConfigured()) return <main className="min-h-dvh bg-[var(--color-bg)] px-4 py-8 sm:py-14"><NotReady /></main>;
  const sub = await subjectFromToken(token).catch(() => null);
  if (!sub) notFound();
  const [m, t] = await Promise.all([methodsFor(sub.restaurant), todayFor(sub)]);
  return (
    <main className="min-h-dvh bg-[var(--color-bg)] px-4 py-8 sm:py-14">
      <PunchPanel token={token} name={sub.name} property={sub.property} methods={m.methods} today={t.today} passkeys={t.passkeys} locationSet={m.lat != null && m.lng != null} />
    </main>
  );
}

function NotReady() {
  return (
    <div className="mx-auto max-w-[460px] feather p-6 text-center" data-not-ready>
      <h1 className="text-xl font-semibold">Phone attendance is off</h1>
      <p className="mt-2 text-sm text-[var(--color-label-2)]">Use your badge at the scanner, or ask your manager to mark you.</p>
    </div>
  );
}
