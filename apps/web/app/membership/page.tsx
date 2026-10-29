import { requireSession, daysLeft } from "@/lib/auth";
import { MembershipClient } from "./MembershipClient";
import { OutletSwitcher } from "@/components/shell/OutletSwitcher";
import { createClient } from "@/lib/supabase/server";
import { platformReady } from "@/lib/platformPay";
export const metadata = { title: "Membership" };
export default async function MembershipPage() {
  const [s, sb] = await Promise.all([requireSession({ allowLocked: true }), createClient()]);
  // 0151: this property's plan and its prices, set in Master control; online payment when DineFlow's keys are on the server
  const { data: planRow } = await sb.rpc("plan_for_me");
  // an outlet whose trial has ended locks only that outlet: the switcher takes the owner to one that is open (0106)
  const others = s.outlets.length > 1 ? <div className="mx-auto max-w-xl px-4 pt-6 flex flex-wrap items-center gap-3 text-[14px]" data-membership-outlets><span className="text-[var(--color-label-2)]">Work in another outlet:</span><OutletSwitcher outlets={s.outlets} /></div> : null;
  return <>{others}<MembershipClient state={s.membership} name={s.restaurant.name} plan={s.restaurant.membership_plan} endsAt={s.restaurant.membership_ends_at} trialDays={daysLeft(s.restaurant.trial_ends_at)} isOwner={["owner", "manager"].includes(s.profile.role)} planInfo={(planRow ?? null) as never} online={platformReady()} /></>;
}
