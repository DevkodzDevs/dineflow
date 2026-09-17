import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PasswordClient } from "./PasswordClient";

export const metadata = { title: "Your password" };
export const dynamic = "force-dynamic";

/**
 * Deliberately outside the (app) group. The app layout is what sends someone here when their
 * password still has to be changed, so this screen must not sit under that layout or the redirect
 * would chase its own tail.
 */
export default async function PasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("must_change_password, contact_email").eq("id", user.id).maybeSingle();
  return <PasswordClient email={user.email ?? ""} contactEmail={profile?.contact_email ?? null}
    forced={!!profile?.must_change_password} />;
}
