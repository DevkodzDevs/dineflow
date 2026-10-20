import { headers } from "next/headers";
import { GetClient } from "./GetClient";

export const metadata = {
  title: "Install DineFlow",
  description: "Put DineFlow on the till, the phone in your apron, or the tablet at the front desk.",
};

/**
 * The address you hand out. Public on purpose: a new waiter has no account yet, and asking somebody
 * to sign in before they can install the thing they are meant to sign in to is a circle.
 *
 * The app files (.apk, .exe) are not served from here: InstallPanel asks /api/download, which answers with a
 * hosted release (NEXT_PUBLIC_APK_URL / NEXT_PUBLIC_EXE_URL) or the file this machine built — never a copy inside
 * the deployment, where an 80 MB installer would ride along with every release. Unset and unbuilt, the button
 * keeps its slot as "coming soon" rather than 404ing on someone.
 */
export default async function GetPage() {
  const h = await headers();
  const base =
    process.env.NEXT_PUBLIC_CLOUD_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;

  return (
    <GetClient
      pageUrl={`${base.replace(/\/$/, "")}/get`}
    />
  );
}
