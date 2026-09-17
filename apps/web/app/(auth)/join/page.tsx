import { AuthForm } from "../AuthForm";
import { join } from "../actions";

export const metadata = { title: "Join your team" };

/**
 * `key` matters here. All three auth routes render the same component in the same slot, so React
 * reconciles them as one instance and carries state across: an error raised on Sign in would still
 * be on screen after moving to Open a restaurant, and the form would look like it had not changed.
 * A distinct key per mode makes each route its own instance.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ pending?: string }> }) {
  const { pending } = await searchParams;
  return <AuthForm key="join" mode="join" action={join} pendingApproval={pending === "1"} />;
}
