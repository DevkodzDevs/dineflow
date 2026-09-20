import { headers } from "next/headers";
import { GetClient } from "./GetClient";
import { resolveFile } from "@/lib/installers";

export const metadata = {
  title: "Install DineFlow",
  description: "Put DineFlow on the till, the phone in your apron, or the tablet at the front desk.",
};

/**
 * The address you hand out. Public on purpose: a new waiter has no account yet, and asking somebody
 * to sign in before they can install the thing they are meant to sign in to is a circle.
 *
 * The files themselves are not served from here. A 79 MB installer inside the app's own deployment
 * would ride along with every release and count against the deployment's size for the rest of its
 * life; these point at wherever the release actually lives — a GitHub release, object storage, a
 * plain file server. Unset means the button says "not published yet" rather than 404ing on someone.
 */
export default async function GetPage() {
  const h = await headers();
  const base =
    process.env.NEXT_PUBLIC_CLOUD_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;

  return (
    <GetClient
      pageUrl={`${base.replace(/\/$/, "")}/get`}
      links={{
        // a release built on this machine is offered straight from it — nobody has to host a 79 MB
        // file just to get the app onto the till in the corner. A hosted address wins when set.
        windows: process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS || (resolveFile("windows") ? "/api/download/windows" : null),
        android: process.env.NEXT_PUBLIC_DOWNLOAD_ANDROID || null,
      }}
    />
  );
}
