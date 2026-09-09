#!/usr/bin/env node
/**
 * DineFlow launcher — one menu for everything.
 *   node launcher.mjs            → interactive menu
 *   node launcher.mjs local      → install (if needed) + database + start web
 *   node launcher.mjs live       → deploy web to Vercel
 * Works on Windows, macOS and Linux. Needs only Node 20+.
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, platform } from "node:process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const rl = createInterface({ input: stdin, output: stdout });
const ask = async (q, def = "") => { const a = (await rl.question(`${q}${def ? ` [${def}]` : ""}: `)).trim(); return a || def; };
const c = { g: "\x1b[32m", y: "\x1b[33m", r: "\x1b[31m", b: "\x1b[1m", d: "\x1b[2m", x: "\x1b[0m" };
const log = (m) => console.log(m), ok = (m) => log(`${c.g}✔${c.x} ${m}`), warn = (m) => log(`${c.y}!${c.x} ${m}`), fail = (m) => log(`${c.r}✖${c.x} ${m}`);
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", cwd: ROOT, shell: true, ...opts });
const has = (cmd) => { try { execSync(`${cmd} --version`, { stdio: "ignore", shell: true }); return true; } catch { return false; } };
const open = (url) => { try { sh(platform === "win32" ? `start "" "${url}"` : platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`, { stdio: "ignore" }); } catch { log(`   Open: ${url}`); } };
const envPath = join(ROOT, ".dineflow.env");
import { networkInterfaces } from "node:os";
const lanIp = () => { for (const l of Object.values(networkInterfaces())) for (const i of l ?? []) if (i.family === "IPv4" && !i.internal) return i.address; return "localhost"; };
const loadEnv = () => existsSync(envPath) ? Object.fromEntries(readFileSync(envPath, "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })) : {};
const saveEnv = (e) => writeFileSync(envPath, Object.entries(e).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");

log(`\n${c.b}  ╔══════════════════════════════════╗\n  ║   DineFlow launcher  v9.0        ║\n  ╚══════════════════════════════════╝${c.x}\n`);

async function checkTools() {
  const v = Number(process.versions.node.split(".")[0]);
  if (v < 20) { fail(`Node ${process.versions.node} found — need Node 20+. Download: https://nodejs.org`); process.exit(1); }
  ok(`Node ${process.versions.node}`);
  if (!has("pnpm")) { warn("pnpm not found — installing…"); try { sh("corepack enable && corepack prepare pnpm@9.12.0 --activate"); } catch { sh("npm i -g pnpm@9"); } }
  ok("pnpm ready");
}

async function configure() {
  const env = loadEnv();
  log(`\n${c.b}Supabase project${c.x} ${c.d}(supabase.com → your project → Settings → API)${c.x}`);
  env.SUPABASE_URL = await ask("Project URL", env.SUPABASE_URL || "https://xxxx.supabase.co");
  env.SUPABASE_ANON_KEY = await ask("anon public key", env.SUPABASE_ANON_KEY || "");
  log(`${c.d}For automatic database setup, paste the connection string (Settings → Database → Connection string → URI, "Session" mode). Leave blank to paste SQL by hand instead.${c.x}`);
  env.DATABASE_URL = await ask("DATABASE_URL", env.DATABASE_URL || "");
  log(`${c.d}Optional. Webhooks, OTA calendars and the booking page work without it (each uses its own token). Press Enter to skip.${c.x}`);
  env.SUPABASE_SERVICE_ROLE_KEY = await ask("SUPABASE_SERVICE_ROLE_KEY (optional)", env.SUPABASE_SERVICE_ROLE_KEY || "");
  log(`${c.d}Optional — real photo recognition on the Scan page. Press Enter to skip: photos then return a clearly-marked sample result and barcodes/QR still work for real.${c.x}`);
  env.ANTHROPIC_API_KEY = await ask("ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY || "");
  saveEnv(env);
  mkdirSync(join(ROOT, "apps/web"), { recursive: true });
  writeFileSync(join(ROOT, "apps/web/.env.local"), `NEXT_PUBLIC_SUPABASE_URL=${env.SUPABASE_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${env.SUPABASE_ANON_KEY}\n${env.ANTHROPIC_API_KEY ? `ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY}\n` : ""}${env.SUPABASE_SERVICE_ROLE_KEY ? `SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY}\n` : ""}`);
  const ip = lanIp();
  writeFileSync(join(ROOT, "apps/mobile/.env"), `EXPO_PUBLIC_SUPABASE_URL=${env.SUPABASE_URL}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${env.SUPABASE_ANON_KEY}\nEXPO_PUBLIC_WEB_URL=${env.PROD_WEB_URL || `http://${ip}:3000`}\n`);
  if (env.DATABASE_URL) writeFileSync(join(ROOT, "packages/db/.env"), `DATABASE_URL=${env.DATABASE_URL}\n`);
  ok("Wrote apps/web/.env.local and apps/mobile/.env");
  return env;
}

async function install() {
  if (existsSync(join(ROOT, "node_modules/.pnpm"))) { ok("Packages already installed"); return; }
  log(`\n${c.b}Installing packages${c.x} ${c.d}(2–4 minutes the first time)${c.x}`);
  sh("pnpm install");
  ok("Installed");
}

async function database(env) {
  if (!env.DATABASE_URL) {
    warn("No DATABASE_URL — opening the SQL editor. Paste supabase/migrations/0001_init.sql, Run, then 0002_hospitality.sql, Run.");
    const ref = (env.SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./) || [])[1];
    open(ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : "https://supabase.com/dashboard");
    await ask("Press Enter when both files have run");
    return;
  }
  log(`\n${c.b}Setting up the database${c.x}`);
  sh(`node scripts/migrate.mjs`, { env: { ...process.env, DATABASE_URL: env.DATABASE_URL } });
  log(`\n${c.b}Built-in Master login${c.x} (no sign-up needed, goes everywhere):\n    email     ${c.b}master@dineflow.in${c.x}\n    password  ${c.b}DineFlow@Master2026${c.x}\n  ${c.y}Change it before going live: sign in → Master control → Change master password.${c.x}`);
  const email = await ask("Also make YOUR email a master admin? (blank to skip)", env.MASTER_EMAIL || "");
  if (email) { env.MASTER_EMAIL = email; saveEnv(env); sh(`node scripts/migrate.mjs --admin "${email}"`, { env: { ...process.env, DATABASE_URL: env.DATABASE_URL } }); }
}

async function local() {
  await checkTools();
  const env = existsSync(join(ROOT, "apps/web/.env.local")) && (await ask("Env files exist. Reconfigure? (y/N)", "N")).toLowerCase() !== "y" ? loadEnv() : await configure();
  await install();
  if ((await ask("Run database setup now? (Y/n)", "Y")).toLowerCase() !== "n") await database(env);
  log(`\n${c.d}Tip: after you sign up, open Settings → "Load demo data" to fill the app with a sample menu, pantry, rooms, bookings, labourers and demo delivery channels.${c.x}`);
  // Everyday use runs the PRODUCTION build: pages are compiled once here, not on every first visit.
  // It rebuilds only when the app's source changed since the last build. Developers wanting live reload use option 11.
  const { execSync } = await import("node:child_process");
  const stamp = join(ROOT, "apps/web/.next/BUILD_ID");
  const newest = (dir) => { let t = 0; for (const f of readdirSync(dir, { withFileTypes: true })) { if (f.name === "node_modules" || f.name === ".next") continue; const p = join(dir, f.name); t = Math.max(t, f.isDirectory() ? newest(p) : statSync(p).mtimeMs); } return t; };
  const stale = !existsSync(stamp) || statSync(stamp).mtimeMs < Math.max(newest(join(ROOT, "apps/web/app")), newest(join(ROOT, "apps/web/components")), newest(join(ROOT, "apps/web/lib")), newest(join(ROOT, "packages/shared/src")));
  if (stale) { log(`\n${c.b}Building the app once${c.x} ${c.d}(about a minute; later starts skip this)${c.x}`); execSync("pnpm --filter @dineflow/web build", { stdio: "inherit", cwd: ROOT, shell: true }); }
  log(`\n${c.b}Starting web app${c.x} → http://localhost:3000  ${c.d}(Ctrl+C to stop)${c.x}`);
  setTimeout(() => open("http://localhost:3000/login"), 2500);
  rl.close();
  spawn("pnpm", ["--filter", "@dineflow/web", "start"], { stdio: "inherit", cwd: ROOT, shell: true });
}

/** For developers: the live-reload server. Pages compile on first visit; keep .next between runs and the second start is far faster. */
async function develop() {
  await checkTools(); await install(); rl.close();
  log(`\n${c.b}Development server${c.x} → http://localhost:3000  ${c.d}(live reload; first page compiles in a few seconds, then instant)${c.x}`);
  spawn("pnpm", ["dev:web"], { stdio: "inherit", cwd: ROOT, shell: true });
}

async function mobile() {
  await checkTools(); await install();
  log(`\n${c.b}Starting Expo${c.x} — scan the QR with Expo Go on your phone (same Wi-Fi)`);
  rl.close();
  spawn("pnpm", ["dev:mobile"], { stdio: "inherit", cwd: ROOT, shell: true });
}

async function live() {
  await checkTools();
  const env = loadEnv();
  if (!env.SUPABASE_URL) { warn("Configure Supabase first (option 1)."); return; }
  log(`\n${c.b}Deploy web to Vercel${c.x} ${c.d}(free account at vercel.com; a browser login opens the first time)${c.x}`);
  const prodUrl = await ask("Production Supabase URL", env.PROD_SUPABASE_URL || env.SUPABASE_URL);
  const prodKey = await ask("Production anon key", env.PROD_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY);
  Object.assign(env, { PROD_SUPABASE_URL: prodUrl, PROD_SUPABASE_ANON_KEY: prodKey }); saveEnv(env);
  const svc = env.SUPABASE_SERVICE_ROLE_KEY ? ` -e SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY}` : "";
  const e = `-e NEXT_PUBLIC_SUPABASE_URL=${prodUrl} -e NEXT_PUBLIC_SUPABASE_ANON_KEY=${prodKey} --build-env NEXT_PUBLIC_SUPABASE_URL=${prodUrl} --build-env NEXT_PUBLIC_SUPABASE_ANON_KEY=${prodKey}${env.ANTHROPIC_API_KEY ? ` -e ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY}` : ""}${svc}`;

  // `--yes` answers Vercel's project questions but it cannot answer "who are you?" — without
  // credentials the CLI just exits 1. So sign in first, and hand the terminal over while it happens.
  const token = env.VERCEL_TOKEN || process.env.VERCEL_TOKEN || "";
  const tok = token ? ` --token ${token}` : "";
  const signedIn = () => { try { execSync(`npx --yes vercel@latest whoami${tok}`, { stdio: "ignore", cwd: ROOT, shell: true }); return true; } catch { return false; } };
  if (!signedIn()) {
    log(`\n${c.b}Signing in to Vercel${c.x} ${c.d}(a browser window opens — pick any method, then come back here)${c.x}`);
    rl.pause();                                   // let the Vercel prompt own the keyboard
    try { sh("npx --yes vercel@latest login"); } catch { /* reported by the check below */ }
    rl.resume();
    if (!signedIn()) {
      fail("Not signed in to Vercel, so there is nothing to deploy to.");
      log(`  ${c.d}Sign in yourself with${c.x} npx vercel login   ${c.d}then run this option again.${c.x}`);
      log(`  ${c.d}On a machine with no browser, create a token at vercel.com/account/tokens and put${c.x} VERCEL_TOKEN=... ${c.d}in .dineflow.env${c.x}`);
      return;
    }
    ok(`Signed in to Vercel.`);
  }

  try { sh(`npx --yes vercel@latest --cwd apps/web --prod --yes ${e}${tok}`); }
  catch {
    fail("Vercel refused the deploy — its own message above says why.");
    log(`  ${c.d}Common causes: the free plan's daily deploy limit, a name already taken, or a build error.${c.x}`);
    log(`  ${c.d}Nothing local changed; fix the cause and run this option again.${c.x}`);
    return;
  }
  ok("Deployed. Copy the URL above into Supabase → Authentication → URL Configuration → Site URL.");
  const pu = await ask("Paste the production URL shown above (for the phone app's photo scanning)", env.PROD_WEB_URL || "");
  if (pu) { env.PROD_WEB_URL = pu.replace(/\/$/, ""); saveEnv(env); }
  if ((await ask("Add a custom domain now? (y/N)", "N")).toLowerCase() === "y") {
    const d = await ask("Domain (e.g. app.yourhotel.in)");
    try { sh(`npx --yes vercel@latest --cwd apps/web domains add ${d}${tok}`); }
    catch { warn(`Could not add ${d} — the site is deployed either way; add the domain in the Vercel dashboard.`); }
  }
  log(`\n${c.d}Mobile store builds: option 5.${c.x}`);
}

async function builds() {
  await checkTools(); await install();
  const env = loadEnv();
  log(`\n${c.b}Build the phone app${c.x} ${c.d}(free Expo account; first run asks you to log in)${c.x}`);
  const which = await ask("1 = Android APK (share on WhatsApp)  2 = Android Play Store  3 = iOS TestFlight/App Store", "1");
  const profile = which === "1" ? "preview" : "production";
  const p = which === "3" ? "ios" : "android";
  const cwd = join(ROOT, "apps/mobile");
  if (!existsSync(join(cwd, "eas.json"))) writeFileSync(join(cwd, "eas.json"), JSON.stringify({ cli: { version: ">= 12.0.0" }, build: { preview: { distribution: "internal", android: { buildType: "apk" }, env: { EXPO_PUBLIC_SUPABASE_URL: env.PROD_SUPABASE_URL || env.SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: env.PROD_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY, EXPO_PUBLIC_WEB_URL: env.PROD_WEB_URL || "" } }, production: { env: { EXPO_PUBLIC_SUPABASE_URL: env.PROD_SUPABASE_URL || env.SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: env.PROD_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY, EXPO_PUBLIC_WEB_URL: env.PROD_WEB_URL || "" } } }, submit: { production: {} } }, null, 2));
  sh(`npx --yes eas-cli@latest build -p ${p} --profile ${profile}`, { cwd });
  ok("Build queued — the link to download/install appears above and at expo.dev.");
}

async function docker() {
  await checkTools();
  const env = existsSync(join(ROOT, "apps/web/.env.local")) ? loadEnv() : await configure();
  if (!has("docker")) { fail("Docker not found. Install Docker Desktop, or use option 3 (Vercel)."); return; }
  writeFileSync(join(ROOT, ".env"), `NEXT_PUBLIC_SUPABASE_URL=${env.PROD_SUPABASE_URL || env.SUPABASE_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${env.PROD_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY}\n${env.ANTHROPIC_API_KEY ? `ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY}\n` : ""}`);
  log(`\n${c.b}Building and starting with Docker${c.x} → http://localhost:3000 (or your server IP)`);
  sh("docker compose up -d --build");
  ok("Running. Stop with: docker compose down");
}


// ── The Box: the whole system on this computer, no internet needed ────────────
import { createHmac, randomBytes } from "node:crypto";
const b64u = (x) => Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const mintJwt = (secret, role) => {
  const h = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const p = b64u(JSON.stringify({ role, iss: "supabase", iat: now, exp: now + 60 * 60 * 24 * 365 * 10 }));
  return `${h}.${p}.${b64u(createHmac("sha256", secret).update(`${h}.${p}`).digest())}`;
};

async function box() {
  await checkTools();
  if (!has("docker")) { fail("Docker is required for the Box. Install Docker Desktop (Windows/Mac) or docker.io (Linux), then run this again."); open("https://docs.docker.com/get-docker/"); return; }
  try { sh("docker compose version", { stdio: "ignore" }); } catch { fail("Docker Compose v2 not found. Update Docker Desktop."); return; }
  const env = loadEnv();
  const ip = lanIp();
  log(`\n${c.b}DineFlow Box${c.x} — runs the database and the app on this computer. Every device on the Wi-Fi uses it with no internet.`);
  log(`${c.d}This computer's address on the Wi-Fi is ${ip}. Give it a fixed IP in your router so it never changes.${c.x}\n`);
  env.BOX_LAN_IP = await ask("Address other devices will use", env.BOX_LAN_IP || ip);
  if (!env.BOX_DB_PASSWORD) { env.BOX_DB_PASSWORD = randomBytes(18).toString("hex"); env.BOX_JWT_SECRET = randomBytes(32).toString("hex"); env.BOX_SECRET_KEY_BASE = randomBytes(48).toString("hex"); }
  env.BOX_ANON_KEY = mintJwt(env.BOX_JWT_SECRET, "anon"); env.BOX_SERVICE_KEY = mintJwt(env.BOX_JWT_SECRET, "service_role");
  log(`${c.d}Your cloud DineFlow address makes this a HYBRID: the building runs here with no internet, and whenever internet exists the Box swaps with the cloud — online orders and OTA bookings come in, your rooms and menu go out, Neighbours and Proof links work. Blank = fully standalone.${c.x}`);
  env.CLOUD_URL = await ask("Cloud address", env.CLOUD_URL || "");
  if (env.CLOUD_URL) { log(`${c.d}In the cloud app: Settings → "Runs on a Box" → Issue box token. Paste it here.${c.x}`); env.BOX_SYNC_TOKEN = await ask("Box token", env.BOX_SYNC_TOKEN || ""); }
  env.BOX_USB_PATH = await ask("USB / external drive folder for nightly backups (blank = local only)", env.BOX_USB_PATH || "");
  saveEnv(env);
  writeFileSync(join(ROOT, ".env"), Object.entries({ BOX_LAN_IP: env.BOX_LAN_IP, BOX_DB_PASSWORD: env.BOX_DB_PASSWORD, BOX_JWT_SECRET: env.BOX_JWT_SECRET, BOX_SECRET_KEY_BASE: env.BOX_SECRET_KEY_BASE, BOX_ANON_KEY: env.BOX_ANON_KEY, BOX_SERVICE_KEY: env.BOX_SERVICE_KEY, CLOUD_URL: env.CLOUD_URL || "", BOX_SYNC_TOKEN: env.BOX_SYNC_TOKEN || "", BOX_USB_PATH: env.BOX_USB_PATH || "./backups", ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || "", BACKUP_HOUR: "2" }).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  // the phone app and any local dev also point at the box
  writeFileSync(join(ROOT, "apps/mobile/.env"), `EXPO_PUBLIC_SUPABASE_URL=http://${env.BOX_LAN_IP}:8000\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${env.BOX_ANON_KEY}\nEXPO_PUBLIC_WEB_URL=http://${env.BOX_LAN_IP}:3000\n`);
  mkdirSync(join(ROOT, "backups"), { recursive: true });

  log(`\n${c.b}Starting the Box${c.x} ${c.d}(first time downloads ~1.5 GB and builds the app: 5–10 minutes)${c.x}`);
  sh("docker compose -f docker-compose.box.yml up -d --build");
  log(`\n${c.b}Setting up the database on the Box${c.x}`);
  await new Promise((r) => setTimeout(r, 8000));
  const local = `postgres://postgres:${env.BOX_DB_PASSWORD}@127.0.0.1:5432/postgres`;
  await install();
  sh(`node scripts/migrate.mjs`, { env: { ...process.env, DATABASE_URL: local, PGSSLMODE: "disable" } });
  log(`\n${c.b}Built-in Master login${c.x} (no sign-up needed, goes everywhere):\n    email     ${c.b}master@dineflow.in${c.x}\n    password  ${c.b}DineFlow@Master2026${c.x}\n  ${c.y}Change it before going live: sign in → Master control → Change master password.${c.x}`);
  const email = await ask("Also make YOUR email a master admin on this Box? (blank to skip)", env.MASTER_EMAIL || "");
  if (email) { env.MASTER_EMAIL = email; saveEnv(env); log(`${c.d}(Sign up first at the address below, then run "node launcher.mjs box-admin" to grant it.)${c.x}`); }

  ok(`The Box is running.`);
  log(`\n  On this computer:      ${c.b}http://localhost:3000${c.x}`);
  log(`  On every other device: ${c.b}http://${env.BOX_LAN_IP}:3000${c.x}   ← type this into phones, tablets, the kitchen screen`);
  log(`  Backups:               ${join(ROOT, "backups")}${env.BOX_USB_PATH ? ` and ${env.BOX_USB_PATH}` : ""}, every night at 2 am`);
  log(`  Stop:                  docker compose -f docker-compose.box.yml down    (data is kept)`);
  log(`  Start again:           node launcher.mjs box\n`);
  if (!env.CLOUD_URL) warn("Standalone Box: Neighbours, OTA calendars, Swiggy/Zomato webhooks and the public booking page need a cloud address. Run option 9 again and add one whenever you like.");
  else ok(`Hybrid: the Box syncs with ${env.CLOUD_URL} every minute the internet is up. Watch the "Box · in step with cloud" badge in the top bar.`);
  setTimeout(() => open("http://localhost:3000/signup"), 2500);
}
async function boxAdmin() {
  const env = loadEnv(); const local = `postgres://postgres:${env.BOX_DB_PASSWORD}@127.0.0.1:5432/postgres`;
  const email = await ask("Email to make MASTER admin on the Box", env.MASTER_EMAIL || "");
  sh(`node scripts/migrate.mjs --admin "${email}"`, { env: { ...process.env, DATABASE_URL: local, PGSSLMODE: "disable" } });
}
async function boxRestore() {
  const env = loadEnv(); const local = `postgres://postgres:${env.BOX_DB_PASSWORD}@127.0.0.1:5432/postgres`;
  const dir = join(ROOT, "backups"); const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql.gz")).sort().reverse() : [];
  if (!files.length) { fail("No backups in ./backups"); return; }
  files.slice(0, 10).forEach((f, i) => log(`  ${i + 1}  ${f}`));
  const pick = files[Number(await ask("Restore which?", "1")) - 1]; if (!pick) return;
  if ((await ask(`This REPLACES all current data on the Box with ${pick}. Type RESTORE to continue`)) !== "RESTORE") return;
  sh(`docker compose -f docker-compose.box.yml exec -T db psql -U postgres -c "drop schema public cascade; create schema public;"`);
  sh(`gunzip -c "${join(dir, pick)}" | docker compose -f docker-compose.box.yml exec -T db psql -U postgres postgres`);
  ok("Restored.");
}

const menu = { 9: ["Box: run the building on this computer — works with AND without internet", box], 11: ["Developer: live-reload server (slower first page, instant edits)", develop], 10: ["Box: restore a backup", boxRestore], 8: ["Start the thermal print bridge (LAN printers)", async () => { rl.close(); spawn("node", ["scripts/print-bridge.mjs"], { stdio: "inherit", cwd: ROOT, shell: true }); }], 1: ["Local: configure + install + database + open web app", local], 2: ["Local: start the mobile app (Expo Go on your phone)", mobile], 3: ["Live: deploy web to Vercel (one command)", live], 4: ["Live: run on your own server with Docker", docker], 5: ["Live: build Android APK / Play Store / iOS", builds], 6: ["Configure Supabase keys again", async () => { await configure(); }], 7: ["Database only: run/repair migrations + master admin", async () => { await checkTools(); await install(); await database(loadEnv()); }] };
const arg = process.argv[2];
if (arg === "local") await local(); else if (arg === "live") await live(); else if (arg === "box") await box(); else if (arg === "box-admin") await boxAdmin(); else if (arg === "box-restore") await boxRestore(); else if (arg === "mobile") await mobile(); else if (arg === "docker") await docker();
else {
  [1,2,3,4,5,6,7,8,9,10,11].filter((k) => menu[k]).forEach((k) => log(`  ${c.b}${k}${c.x}  ${menu[k][0]}`));
  const ch = await ask("\nChoose", "1");
  // A failed step is an ordinary outcome here (no network, not signed in, port busy). Report it the
  // way the rest of this launcher reports things — a Node stack trace tells the owner nothing.
  if (menu[ch]) {
    try { await menu[ch][1](); }
    catch (err) {
      fail(`That step stopped: ${String(err?.message ?? err).split("\n")[0]}`);
      log(`  ${c.d}Nothing was left half-done that re-running cannot repeat — fix the cause above and choose the option again.${c.x}`);
      process.exitCode = 1;
    }
  } else fail("Unknown option");
}
if (!["1", "2"].includes(arg) && !["local", "mobile"].includes(arg)) { try { rl.close(); } catch {} }
