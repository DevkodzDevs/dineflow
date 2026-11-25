"use client";
import { EmailCodeField, sameEmail, type Verified } from "@/components/EmailCodeField";
import { sendOwnerCode, verifyOwnerCode } from "./actions";

export { sameEmail };

/**
 * "Owner's real email" on Master control → Create a property (0195, 2026-11-25 — the owner: "the owner's real email gets
 * a code at once; type the code here; only when it verifies is the property created — otherwise no property account").
 * The shared EmailCodeField (0196) with Master control's two calls; Create property stays off until it is verified
 * (AdminClient) and the database refuses it as well (admin_create_property_verified). Since 0196 an address already used
 * by any DineFlow account gets no code.
 */
export function OwnerEmailVerify({ email, onEmail, propertyName, verified, onVerified }: {
  email: string; onEmail: (v: string) => void; propertyName: string;
  verified: Verified | null; onVerified: (v: Verified | null) => void;
}) {
  return (
    <div data-owner-email>
      <EmailCodeField label="Owner's real email *" email={email} onEmail={onEmail} verified={verified} onVerified={onVerified}
        placeholder="owner@gmail.com" hintIdle="A code is sent here · the property is created only after it is verified"
        hintVerified="Verified · password-reset codes go here" askWho="Ask the owner for it — inbox or spam."
        send={(e) => sendOwnerCode(e, propertyName)} verify={verifyOwnerCode} />
    </div>
  );
}
