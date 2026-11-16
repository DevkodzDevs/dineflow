"use client";
import { createContext, useContext } from "react";

/**
 * The page's words for its client pieces, in the visitor's language (lib/siteWords.ts `clientWords`). In English the
 * table is empty and every line is itself, so the default page ships nothing extra; in Tamil or Hindi it carries only
 * the forty-odd lines those pieces show. A context, so a piece drawn on the server says the same thing it says after
 * hydration.
 */
const Words = createContext<Record<string, string>>({});
export function SiteWords({ words, children }: { words: Record<string, string>; children: React.ReactNode }) { return <Words.Provider value={words}>{children}</Words.Provider>; }
/** `const w = useW(); w("Close")` — the line in the page's language, or the line itself. */
export const useW = () => { const table = useContext(Words); return (line: string): string => table[line] ?? line; };
