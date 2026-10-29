/**
 * Where the whole-app language applies, and the script that gets it ready before the first paint.
 *
 * Staff screens (the app, sign-in) follow the device's choice. These stay in English whatever the
 * device says: a guest's own pages (they read them on their own phone), the legal pages (the English
 * is the binding text), Master control, and the public landing page.
 */
import { DICT_URL } from "./files";

/* 2026-10-29: "/" is the public front page now (it was a redirect to sign-in), so it is translated like the app; the blog
   is English-only, like the guest pages */
export const ENGLISH_ONLY_SRC = "^/(admin|legal|dine|book|pay|record|feedback|checkin|queue|screen|kiosk|get|offline|blog)(/|$)";
export const ENGLISH_ONLY = new RegExp(ENGLISH_ONLY_SRC);
/** Fired on window when the device's language changes, so the page follows without a reload. */
export const LANG_EVENT = "df-lang-change";

/**
 * Runs in <head> before anything paints (like THEME_BOOT). When the device is set to the whole app in
 * Tamil or Hindi it sets <html lang>, starts fetching the dictionary at once — in parallel with the
 * app's own scripts — and holds the page invisible until the first translation pass is done, so nobody
 * sees the English flash first. If anything goes wrong the page shows anyway after 2.5 s, in English.
 */
export const LANG_BOOT = `(function(){try{var m=(document.cookie.match(/(?:^|; )df-lang=(ta-all|hi-all)/)||[])[1];if(!m||new RegExp(${JSON.stringify(ENGLISH_ONLY_SRC)}).test(location.pathname))return;var l=m.slice(0,2),h=document.documentElement,u=${JSON.stringify(DICT_URL)}[l];h.lang=l;h.setAttribute("data-lang-all",l);h.setAttribute("data-lang-pending","");window.__dfDict={lang:l,p:fetch(u).then(function(r){return r.ok?r.json():null}).catch(function(){return null})};setTimeout(function(){h.removeAttribute("data-lang-pending")},2500);}catch(e){}})();`;
