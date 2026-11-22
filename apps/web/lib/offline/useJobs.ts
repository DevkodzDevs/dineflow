"use client";
import { useEffect, useState } from "react";
import { onQueue } from "./sync";
import type { Job } from "./db";

/** Everything waiting on this device, kept current — for a screen that draws its own queued work (lib/offline/local.ts).
 *  Empty on the server and on the first client render, so the two agree. */
export function useJobs(): Job[] {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => { const un = onQueue(setJobs); return () => { un(); }; }, []);
  return jobs;
}
