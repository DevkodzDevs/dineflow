"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Camera, Check, Fingerprint, LogIn, LogOut, MapPin, RotateCcw, ShieldCheck } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { attendPunchBegin, attendPunchFinish, attendRegisterBegin, attendRegisterFinish, attendSelfie } from "@/app/attend/actions";

export type Today = { in_at: string | null; out_at: string | null; method_in: string | null; method_out: string | null; hours: number | null } | null;
const METHOD: Record<string, string> = { manual: "Marked by manager", qr: "Badge scan", biometric: "Fingerprint / Face ID", selfie: "Selfie + location" };
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The phone's own name for itself, for the list of set-up devices. */
function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone"; if (/iPad|Macintosh.*Mobile/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone"; if (/Windows/.test(ua)) return "Windows PC"; if (/Mac/.test(ua)) return "Mac";
  return "This device";
}

/** A selfie at 640px on the long side, as JPEG — a 4 MB camera photo becomes ~60 KB. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 640 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.82));
}

function where(): Promise<GeolocationPosition> {
  return new Promise((ok, no) => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
    : no(new Error("This browser cannot share a location")));
}

/**
 * The punch clock for one person, on their own phone: who, today so far, and one big button per way
 * the owner has switched on. Used by /attend/<token> (a labourer, no sign-in) and /attendance (staff).
 */
export function PunchPanel({ token, name, property, methods, today, passkeys, locationSet }: {
  token: string | null; name: string; property: string; methods: string[]; today: Today; passkeys: number; locationSet: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [canBio, setCanBio] = useState<boolean | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null);
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000);
    (async () => setCanBio(browserSupportsWebAuthn() && await platformAuthenticatorIsAvailable().catch(() => false)))();
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const next: "in" | "out" | "done" = !today?.in_at ? "in" : !today.out_at ? "out" : "done";
  const bio = methods.includes("biometric"), selfie = methods.includes("selfie");
  const word = next === "in" ? "Punch in" : "Punch out";
  const done = (r: { error?: string; event?: string; at?: string; hours?: number }) => {
    if (r.error) { setMsg({ tone: "bad", text: r.error }); return; }
    setMsg({ tone: "good", text: r.event === "in" ? `Punched in at ${time(r.at ?? new Date().toISOString())}` : r.event === "out" ? `Punched out${r.hours != null ? ` · ${r.hours} h today` : ""}` : "You are already punched out for today" });
    setShot(null); setPos(null); router.refresh();
  };

  const setUp = () => start(async () => {
    setMsg(null);
    const o = await attendRegisterBegin(token);
    if ("error" in o) return setMsg({ tone: "bad", text: o.error });
    if (!("options" in o)) return;
    try {
      const resp = await startRegistration({ optionsJSON: o.options as never });
      const r = await attendRegisterFinish(token, resp, deviceLabel());
      if ("error" in r) return setMsg({ tone: "bad", text: r.error });
      setMsg({ tone: "good", text: "Fingerprint / Face ID is set up on this phone" }); router.refresh();
    } catch (e) { setMsg({ tone: "bad", text: (e as Error).name === "NotAllowedError" ? "Cancelled — try again when ready" : (e as Error).message }); }
  });
  const punchBio = () => start(async () => {
    setMsg(null);
    const o = await attendPunchBegin(token);
    if ("error" in o) return setMsg({ tone: "bad", text: o.error });
    if (!("options" in o)) return;
    try { const resp = await startAuthentication({ optionsJSON: o.options as never }); done(await attendPunchFinish(token, resp, deviceLabel()) as never); }
    catch (e) { setMsg({ tone: "bad", text: (e as Error).name === "NotAllowedError" ? "Cancelled — try again when ready" : (e as Error).message }); }
  });
  /* location first — if it is refused there is no point taking the photo */
  const beginSelfie = () => start(async () => {
    setMsg(null);
    try { setPos(await where()); fileRef.current?.click(); }
    catch (e) { setMsg({ tone: "bad", text: (e as GeolocationPositionError).code === 1 ? "Location is blocked — allow it for this site in the browser, then try again" : "Could not find your location — step outside or near a window and try again" }); }
  });
  const sendSelfie = () => start(async () => {
    if (!shot || !pos) return;
    const fd = new FormData();
    fd.set("photo", new File([shot.blob], "selfie.jpg", { type: "image/jpeg" }));
    fd.set("lat", String(pos.coords.latitude)); fd.set("lng", String(pos.coords.longitude)); fd.set("accuracy", String(pos.coords.accuracy));
    done(await attendSelfie(token, fd) as never);
  });

  return (
    <div className="mx-auto w-full max-w-[460px] space-y-4" data-punch>
      <section className="feather p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="h-12 w-12 shrink-0 rounded-full bg-[var(--color-tint)] text-[var(--color-on-tint)] grid place-items-center font-display text-xl">{name.slice(0, 1)}</span>
          <div className="min-w-0 flex-1"><div className="text-[17px] font-semibold truncate">{name}</div><div className="text-[13px] text-[var(--color-label-2)] truncate">{property}</div></div>
        </div>
        <div className="mt-5 text-center">
          <div className="num font-display text-[44px] leading-none tracking-tight" suppressHydrationWarning>{now ? now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }) : " "}</div>
          <div className="mt-1.5 text-[13px] text-[var(--color-label-2)]" suppressHydrationWarning>{now ? now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }) : " "}</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2" data-today>
          {(["in", "out"] as const).map((k) => { const at = k === "in" ? today?.in_at : today?.out_at; const m = k === "in" ? today?.method_in : today?.method_out; return (
            <div key={k} className={cn("rounded-2xl p-3 min-w-0", at ? "bg-[color-mix(in_srgb,var(--color-green)_14%,transparent)]" : "bg-[var(--color-fill)]")}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--color-label-2)]">{k === "in" ? <LogIn size={12} /> : <LogOut size={12} />} {k === "in" ? "In" : "Out"}</div>
              <div className="num text-[20px] font-semibold mt-1">{at ? time(at) : "—"}</div>
              <div className="text-[11.5px] text-[var(--color-label-2)] truncate">{at ? METHOD[m ?? ""] ?? m : k === "in" ? "Not yet" : today?.in_at ? "Still at work" : "—"}</div>
            </div>); })}
        </div>
        {next === "done" && <p className="mt-3 text-center text-[13px] text-[var(--color-label-2)]"><Check size={14} className="inline -mt-0.5 text-[var(--color-green)]" /> Done for today{today?.hours != null && <> · <b className="num text-[var(--color-label)]">{today.hours} h</b></>}</p>}
      </section>

      {msg && <div role="status" className={cn("rounded-2xl px-4 py-3 text-[14px] font-medium", msg.tone === "good" ? "bg-[color-mix(in_srgb,var(--color-green)_16%,transparent)] text-[var(--color-label)]" : "bg-[var(--color-red-2)] text-[var(--color-red)]")}>{msg.text}</div>}

      {next !== "done" && (
        <section className="space-y-3">
          {bio && (canBio === false
            ? <p className="feather p-4 text-[13px] text-[var(--color-label-2)]"><Fingerprint size={15} className="inline -mt-0.5" /> This browser cannot use a fingerprint or Face ID. Open this page in Chrome (Android) or Safari (iPhone).</p>
            : passkeys > 0
              ? <Button size="lg" className="w-full" loading={pending} onClick={punchBio} data-method="biometric"><Fingerprint size={20} /> {word} with fingerprint</Button>
              : <Button size="lg" variant="outline" className="w-full" loading={pending} onClick={setUp} data-method="biometric-setup"><ShieldCheck size={20} /> Set up fingerprint / Face ID</Button>)}

          {selfie && (!locationSet
            ? <p className="feather p-4 text-[13px] text-[var(--color-label-2)]"><MapPin size={15} className="inline -mt-0.5" /> Selfie attendance starts once the owner sets the property&apos;s location in Settings.</p>
            : shot
              ? <div className="feather p-4 space-y-3" data-selfie-preview>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
                  <img src={shot.url} alt="Your selfie" className="mx-auto h-48 w-48 rounded-2xl object-cover" />
                  {pos && <p className="text-center text-[12px] text-[var(--color-label-2)]"><MapPin size={12} className="inline -mt-0.5" /> Location found · within {Math.round(pos.coords.accuracy)} m</p>}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <Button size="lg" className="w-full" loading={pending} onClick={sendSelfie} data-send><Check size={20} /> {word}</Button>
                    <Button size="lg" variant="outline" aria-label="Take again" disabled={pending} onClick={beginSelfie}><RotateCcw size={18} /></Button>
                  </div>
                </div>
              : <Button size="lg" variant={bio && passkeys > 0 ? "outline" : "primary"} className="w-full" loading={pending} onClick={beginSelfie} data-method="selfie"><Camera size={20} /> {word} with selfie</Button>)}

          {!bio && !selfie && <p className="feather p-4 text-[13px] text-[var(--color-label-2)]">Punching from your own phone is turned off here. Use your badge at the scanner, or ask your manager to mark you.</p>}
          <input ref={fileRef} type="file" accept="image/*" capture="user" hidden style={{ display: "none" }} data-selfie-input
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; const blob = await shrink(f); setShot({ blob, url: URL.createObjectURL(blob) }); }} />
        </section>
      )}

      {bio && passkeys > 0 && canBio !== false && <p className="text-center text-[12px] text-[var(--color-label-3)]">Your fingerprint never leaves this phone — it only unlocks a key kept on it. <button type="button" className="underline !min-h-0" onClick={setUp} disabled={pending}>Set up another phone</button></p>}
    </div>
  );
}
