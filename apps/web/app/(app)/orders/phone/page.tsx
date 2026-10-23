import { SvcHead } from "@/components/ui/Service";
import { PhoneClient } from "./PhoneClient";
export const metadata = { title: "Phone order" };

/** A call comes in: the number first, then who it is, where they live, what they had — and the till, ready. */
export default function PhoneOrderPage() {
  return (
    <>
      <SvcHead icon="orders" title="Phone order" sub="Type the caller's number" />
      <PhoneClient />
    </>
  );
}
