"use client";
import { InstallPanel } from "@/components/shell/InstallPanel";

/**
 * Installing DineFlow onto the device it runs on — the till in the corner, the phone in an apron.
 *
 * Installed, it opens without a browser bar, keeps its own window on a desktop, and survives a
 * dropped line through the service worker that is already here. Nothing about the app changes; it
 * just stops looking like a website on a machine that only ever runs this one thing.
 *
 * The card for Settings is the same panel as /get, the install sheet and the sign-in page. The <head>
 * script that catches the browser's offer is INSTALL_CAPTURE in lib/install.ts — kept out of this client
 * module so the root layout does not carry the panel into every page.
 */
export function InstallApp() {
  return <InstallPanel />;
}
