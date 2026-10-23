/**
 * The opening screen of the installed app (2026-10-23, the owner: "when the app opens, show the logo with an animation,
 * then the main page"). Runs in <head>, before the first paint, and only when DineFlow runs as an app — installed from
 * the browser (display-mode standalone / fullscreen), the iPhone home screen (navigator.standalone), or the Android app
 * (its first page is opened with an android-app:// referrer) — and once per launch (sessionStorage). A plain browser tab
 * never sees it, so the website is not slowed.
 *
 * It sets <html data-splash="in">; globals.css (the SPLASH block) draws the screen from pseudo-elements of <html> and
 * <body> — nothing is added to the page React renders, so hydration never meets it. It leaves once the page has loaded and
 * at least 1.1 s have passed (the logo's own animation), fading out over 0.35 s; at most 4 s whatever happens. On the
 * Android app it follows the system splash on the same dark colour, so one runs into the other. `?splash=1` shows it in
 * a browser too (to look at it, and for the probes).
 */
export const SPLASH_BOOT = `(function(){try{var d=document.documentElement,q=/[?&]splash=1(&|$)/.test(location.search);var app=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true||document.referrer.indexOf('android-app://')===0;if(!q&&(!app||sessionStorage.getItem('df-splash')))return;try{sessionStorage.setItem('df-splash','1')}catch(e){}d.setAttribute('data-splash','in');(new Image()).src='/icon-192.png';var t0=Date.now(),gone=false;var out=function(){if(gone)return;gone=true;d.setAttribute('data-splash','out');setTimeout(function(){d.removeAttribute('data-splash')},380)};var ready=function(){setTimeout(out,Math.max(0,1100-(Date.now()-t0)))};if(document.readyState==='complete')ready();else addEventListener('load',ready,{once:true});setTimeout(out,4000)}catch(e){}})();`;
