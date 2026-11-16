"use client";
import { useEffect, useState } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p = (n: number) => String(n).padStart(2, "0");

/**
 * Ember's LED clock (0186): the device's time in orange digits on a black plate under the menu, the date on the left and
 * whether this device can reach the network on the right (navigator.onLine — the same signal the offline banner uses).
 * Drawn only on the Ember theme (Nav.tsx), so no other theme pays for a tick a second. Time arrives after the first
 * paint: the server cannot know the device's clock, and a guessed time would not match on hydration.
 */
export function EmberClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const tick = () => setNow(new Date()); tick();
    const id = setInterval(tick, 1000);
    const net = () => setOnline(navigator.onLine); net();
    window.addEventListener("online", net); window.addEventListener("offline", net);
    return () => { clearInterval(id); window.removeEventListener("online", net); window.removeEventListener("offline", net); };
  }, []);
  return (
    <div className="ember-clock rail-hide" data-ember-clock>
      <time className="ember-time" dateTime={now?.toISOString()}>{now ? `${p(now.getHours())}:${p(now.getMinutes())}` : "--:--"}<small>{now ? p(now.getSeconds()) : "--"}</small></time>
      <div className="ember-sub"><span>{now ? `${DAYS[now.getDay()]} ${p(now.getDate())} ${MONS[now.getMonth()]}` : "\u00a0"}</span><span className={online ? "on" : "off"}>● {online ? "Online" : "Offline"}</span></div>
    </div>
  );
}
