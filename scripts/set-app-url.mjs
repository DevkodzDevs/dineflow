/**
 * Point every part of DineFlow at one address.
 *
 *   node scripts/set-app-url.mjs https://app.dineflow.in
 *
 * The website works this out for itself from the request, so it never needed telling. The two
 * things that DO need telling are the ones that get handed to somebody else and then run far away
 * from this machine: the desktop app, which has the address compiled into it, and the phone app,
 * which has it baked into its build profile. Moving from a test deployment to the real one used to
 * mean remembering both, in different files, in different formats — and forgetting either leaves an
 * app that silently talks to the old address.
 *
 * Run this once when the live address changes, then rebuild whichever of the two you actually ship.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = (process.argv[2] ?? "").trim().replace(/\/+$/, "");

if (!/^https?:\/\/[^\s/]+/.test(url)) {
  console.error("Give the address the app will live at, for example:\n  node scripts/set-app-url.mjs https://app.dineflow.in");
  process.exit(1);
}
if (url.startsWith("http://") && !/localhost|127\.0\.0\.1|192\.168\.|10\./.test(url)) {
  console.error(`Refusing ${url}: a public address must be https, or phones will not install it and sign-in cookies will not stick.`);
  process.exit(1);
}

const touched = [];

/** The web app: only needed for the absolute links it prints into QR codes and e-mails. */
const envPath = join(ROOT, "apps/web/.env.local");
if (existsSync(envPath)) {
  const before = readFileSync(envPath, "utf8");
  const after = /^NEXT_PUBLIC_CLOUD_URL=/m.test(before)
    ? before.replace(/^NEXT_PUBLIC_CLOUD_URL=.*$/m, `NEXT_PUBLIC_CLOUD_URL=${url}`)
    : before.replace(/\s*$/, "\n") + `NEXT_PUBLIC_CLOUD_URL=${url}\n`;
  if (after !== before) { writeFileSync(envPath, after); touched.push("apps/web/.env.local"); }
}

/** The phone app: every build profile, so a preview build and a store build agree. */
const easPath = join(ROOT, "apps/mobile/eas.json");
if (existsSync(easPath)) {
  const eas = JSON.parse(readFileSync(easPath, "utf8"));
  let changed = false;
  for (const profile of Object.values(eas.build ?? {})) {
    if (profile?.env && profile.env.EXPO_PUBLIC_WEB_URL !== url) { profile.env.EXPO_PUBLIC_WEB_URL = url; changed = true; }
  }
  if (changed) { writeFileSync(easPath, JSON.stringify(eas, null, 2) + "\n"); touched.push("apps/mobile/eas.json"); }
}

/** The desktop app: the address compiled in as the default when nothing overrides it. */
const mainPath = join(ROOT, "apps/desktop/main.cjs");
if (existsSync(mainPath)) {
  const before = readFileSync(mainPath, "utf8");
  const after = before.replace(/(const BUILT_URL = process\.env\.DINEFLOW_APP_URL \|\| ")[^"]*(")/, `$1${url}$2`);
  if (after !== before) { writeFileSync(mainPath, after); touched.push("apps/desktop/main.cjs"); }
}

console.log(`DineFlow now points at ${url}\n`);
console.log(touched.length ? "  updated:\n" + touched.map((t) => `    ${t}`).join("\n") : "  everything already pointed there");
console.log(`
  Next, rebuild only what you actually hand out:
    the website    — deploy as usual; it reads its own address from the request
    the desktop app — pnpm --filter @dineflow/desktop dist
    the phone app   — cd apps/mobile && eas build --profile preview --platform android

  Nothing needs rebuilding if you install through the browser, which is the recommended path:
  an installed web app follows the site the moment you deploy.`);
