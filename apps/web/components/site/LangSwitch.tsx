"use client";
import { useEffect, useState } from "react";

/**
 * The public site's language (item 18): English, Tamil or Hindi, through the app's own whole-app translation (lib/i18n —
 * the df-lang cookie, the same one a staff member's choice sets). A short select, so it fits the header on a phone.
 */
const OPTIONS = [["en", "English"], ["ta-all", "தமிழ்"], ["hi-all", "हिंदी"]] as const;

export function LangSwitch() {
  const [v, setV] = useState("en");
  useEffect(() => { const m = document.cookie.match(/(?:^|; )df-lang=([^;]+)/); if (m && OPTIONS.some(([k]) => k === m[1])) setV(m[1]); }, []);
  return (
    <select value={v} aria-label="Language" data-site-lang className="!h-10 !w-auto !min-w-0 !py-0 !pl-3 !pr-8 !text-[13px] !rounded-xl"
      onChange={(e) => { const l = e.target.value; document.cookie = `df-lang=${l}; path=/; max-age=31536000; samesite=lax`; location.reload(); }}>
      {OPTIONS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  );
}
