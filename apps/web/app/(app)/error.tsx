"use client";
import { ErrorRecovery } from "@/components/ErrorRecovery";

/**
 * A screen inside the app failed. Caught here, under app/(app)/layout.tsx, the sidebar, the phone's
 * tab bar and the top bar stay up — the person can tap Try again or simply go to another screen. With
 * only the root boundary, one failing screen replaced the whole app with a bare card: it looked as
 * if everything had crashed. A tab left open across a deploy still reloads itself once (ErrorRecovery).
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorRecovery error={error} reset={reset} inline />;
}
