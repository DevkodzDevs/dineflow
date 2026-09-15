"use client";
import { ErrorRecovery } from "@/components/ErrorRecovery";

/** Catches a failure anywhere below the root layout — every screen in the app. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorRecovery error={error} reset={reset} />;
}
