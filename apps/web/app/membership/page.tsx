import { requireSession, daysLeft } from "@/lib/auth";
import { MembershipClient } from "./MembershipClient";
export const metadata = { title: "Membership" };
export default async function MembershipPage() {
  const s = await requireSession({ allowLocked: true });
  return <MembershipClient state={s.membership} name={s.restaurant.name} plan={s.restaurant.membership_plan} endsAt={s.restaurant.membership_ends_at} trialDays={daysLeft(s.restaurant.trial_ends_at)} isOwner={["owner", "manager"].includes(s.profile.role)} />;
}
