/**
 * The stale-build guard, inline in <head> (2026-10-30, the owner's iPhone: Next's bare "Application error: a client-side
 * exception has occurred" — with nothing in the crash log). A phone tab or a home-screen app kept from before a deploy
 * asks for build files the server no longer has; when that happens before React is up, or to the root's own files, no
 * error boundary of the app's can run (they are in those files), and Next draws its default screen.
 *
 * This runs before any of those files: a failed <script>/<link> for a .js or .css under /_next/static/, or a ChunkLoadError (or the browser's
 * "dynamically imported module" failures) thrown or rejected anywhere, reloads the page once — onto the new build. The time
 * is kept in sessionStorage under the same key the error card uses (df-reloaded-after-stale-build, components/shell/
 * recover.ts), so between them a page reloads itself at most once in 30 s; with no storage it never reloads (it could not
 * stop a loop). Never on /login or /logout, whose pages can be the answer to a form post.
 *
 * Plain ES5 in a string, no nonce needed: the CSP (next.config.ts) has no script-src yet. If one is added, this script
 * needs the nonce (or its hash) like THEME_BOOT and the others.
 */
export const STALE_BOOT = `(function(){var K='df-reloaded-after-stale-build',R=/ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i;
function go(){var p=location.pathname;if(/^\\/log(in|out)/.test(p))return;try{if(Date.now()-(+sessionStorage.getItem(K)||0)<30000)return;sessionStorage.setItem(K,String(Date.now()))}catch(e){return}location.reload()}
function bad(x){return !!x&&R.test(String(x.name)+' '+String(x.message||x))}
addEventListener('error',function(e){var t=e.target,u=t&&(t.src||t.href);if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')&&typeof u==='string'&&/\\/_next\\/static\\/[^?#]*\\.(js|css)([?#]|$)/.test(u))go();else if(R.test(String(e.message))||bad(e.error))go()},true);
addEventListener('unhandledrejection',function(e){if(bad(e.reason))go()})})()`;
