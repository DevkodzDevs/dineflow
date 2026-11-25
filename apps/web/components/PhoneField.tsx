"use client";
import { useState } from "react";
import { Field, PhoneInput } from "@/components/ui";
import { okPhone } from "@/lib/phone";

/**
 * A phone box that says at once when the number already belongs to another DineFlow account (0196 — the owner: "phone,
 * email and user id must never repeat"). `check` asks the database (contact_available) when the box is left with a whole
 * number; `onTaken` tells the parent so its Create / Add button can stay off. The database refuses a repeat anyway — this
 * only says it before the button is pressed.
 */
export function PhoneField({ label, hint, value, onValue, name, required, check, onTaken }: {
  label: string; hint?: string; value: string; onValue: (v: string) => void; name?: string; required?: boolean;
  check?: (phone: string) => Promise<{ ok: true; phone_taken: boolean } | { error?: string }>;
  onTaken?: (taken: boolean) => void;
}) {
  const [taken, setTaken] = useState(false);
  const set = (t: boolean) => { setTaken(t); onTaken?.(t); };
  return (
    <div className="space-y-1.5 min-w-0" data-phone-field data-taken={taken ? "1" : "0"}>
      <Field label={label} hint={hint}>
        <PhoneInput name={name} required={required} value={value} placeholder="9876543210"
          onValue={(v) => { onValue(v); if (taken) set(false); }}
          onBlur={() => { if (!check || !okPhone(value)) return; void check(value).then((r) => { if ("ok" in r) set(r.phone_taken); }); }} />
      </Field>
      {taken && <p className="text-sm text-chili" role="alert" data-phone-taken>This number is already used by another DineFlow account. Use a different number.</p>}
    </div>
  );
}
