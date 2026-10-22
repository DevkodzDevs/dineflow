/**
 * Buzz the guest's phone (2026-10-23, the owner: "vibration for each update").
 *
 * Android browsers vibrate through `navigator.vibrate`, once the page has been touched. Safari on an iPhone has no
 * vibrate at all; since iOS 18 a switch-style checkbox gives a light haptic tick when its label is clicked, so on an
 * iPhone each pulse of the pattern is one such tick — best effort: iOS may ignore it outside a tap, and it never
 * works on iOS 17 or older. Nothing here throws; a phone that cannot buzz simply stays still.
 */
export type BuzzKind = "tap" | "sent" | "moved" | "called" | "seated" | "done";
export const BUZZ: Record<BuzzKind, number[]> = {
  tap: [14],
  sent: [40, 60, 40],
  moved: [70, 60, 70],
  done: [60, 50, 60, 50, 120],
  seated: [140, 70, 140],
  called: [260, 120, 260, 120, 520],
};

const isIOS = () => typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
export const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
/** Can this phone buzz at all — a real vibrate, or the iPhone's haptic tick. */
export const canBuzz = () => canVibrate() || isIOS();

let label: HTMLLabelElement | null = null;
function tick() {
  if (typeof document === "undefined") return;
  if (!label) {
    label = document.createElement("label"); label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
    const input = document.createElement("input"); input.type = "checkbox"; input.setAttribute("switch", ""); input.tabIndex = -1;
    label.appendChild(input); document.body.appendChild(label);
  }
  label.click();
}

/** One pattern: on, off, on… in milliseconds. Returns how it was delivered. */
export function buzz(kind: BuzzKind): "vibrate" | "haptic" | "none" {
  const p = BUZZ[kind];
  try { if (canVibrate() && navigator.vibrate(p)) return "vibrate"; } catch { /* blocked until a tap */ }
  if (!isIOS()) return "none";
  try { let t = 0; p.forEach((ms, k) => { if (k % 2 === 0) setTimeout(tick, t); t += ms; }); return "haptic"; } catch { return "none"; }
}
