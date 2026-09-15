"use client";
import { ErrorRecovery } from "@/components/ErrorRecovery";
import "./globals.css";

/**
 * The last resort: a failure in the root layout itself, which happens above every other boundary.
 * React replaces the whole document here, so this file has to supply its own html and body.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-theme="dark">
      <body><ErrorRecovery error={error} reset={reset} /></body>
    </html>
  );
}
