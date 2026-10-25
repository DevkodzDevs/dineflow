/**
 * The opening screen of the installed app (2026-10-23, the owner: "when the app opens, show the logo with an animation,
 * then the main page"). Runs in <head>, before the first paint, and only when DineFlow runs as an app — installed from
 * the browser (display-mode standalone / fullscreen), the iPhone home screen (navigator.standalone), or the Android app
 * (its first page is opened with an android-app:// referrer) — and once per launch (sessionStorage). A plain browser tab
 * never sees it, so the website is not slowed.
 *
 * It sets <html data-splash="in">; globals.css (the SPLASH block) draws the screen from pseudo-elements of <html> and
 * <body> — nothing is added to the page React renders, so hydration never meets it. It leaves once the page has loaded and
 * at least 0.6 s have passed, fading out over 0.35 s; at most 3 s whatever happens. "Loaded" is the document parsed
 * (DOMContentLoaded), not every image — waiting for the last picture and a 1.1 s minimum made the app feel slow to open
 * (2026-10-24). Emerald, like the phone's own launch screen and the service worker's launch loader, which also marks
 * the launch (df-splash) so the two never play back to back. `?splash=1` shows it in
 * a browser too (to look at it, and for the probes).
 *
 * It also marks <html data-app> whenever DineFlow runs as an app, every launch (2026-10-25): the installed iPad app draws
 * its frame below the status bar from that (globals.css, the iPad frame block) — a browser tab has no status bar over it.
 */
export const SPLASH_BOOT = `(function(){try{var d=document.documentElement,q=/[?&]splash=1(&|$)/.test(location.search);var app=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true||document.referrer.indexOf('android-app://')===0;if(app)d.setAttribute('data-app','');if(!q&&(!app||sessionStorage.getItem('df-splash')))return;try{sessionStorage.setItem('df-splash','1')}catch(e){}d.setAttribute('data-splash','in');(new Image()).src='/icon-192.png';var t0=Date.now(),gone=false;var out=function(){if(gone)return;gone=true;d.setAttribute('data-splash','out');setTimeout(function(){d.removeAttribute('data-splash')},380)};var ready=function(){setTimeout(out,Math.max(0,600-(Date.now()-t0)))};if(document.readyState!=='loading')ready();else document.addEventListener('DOMContentLoaded',ready,{once:true});setTimeout(out,3000)}catch(e){}})();`;

/** The iPhone and iPad launch images (public/splash/, drawn by the probe launch97.mjs): iOS shows the one matching the
 *  device the instant a home-screen app starts, before any page — without them it showed black. Emerald like the
 *  splash. iOS reads them when the app is added to the home screen, so an app added earlier keeps black until it is
 *  removed and added again. [file, media] */
export const LAUNCH_IMAGES: [string, string][] = [
["640x1136.png", "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["750x1334.png", "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["1242x2208.png", "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["1125x2436.png", "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["828x1792.png", "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["1242x2688.png", "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["1170x2532.png", "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["1284x2778.png", "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["1179x2556.png", "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["1290x2796.png", "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["1206x2622.png", "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["1320x2868.png", "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"],
  ["1488x2266.png", "(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["1536x2048.png", "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["1620x2160.png", "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["1640x2360.png", "(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["1668x2224.png", "(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["1668x2388.png", "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
  ["2048x2732.png", "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"],
];
