"use client";
import { useState } from "react";
import { phone10, MOBILE_PATTERN, MOBILE_HINT, okPhone } from "@/lib/phone";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "value"> & {
  value?: string | null;
  /** the cleaned number (digits only, at most ten) */
  onValue?: (v: string) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

/**
 * Every phone box in the app (2026-11-04, the owner: "10 digits only, Indian mobile format"). It keeps at most ten digits of
 * whatever is typed or pasted (`phone10`: +91 and a trunk 0 drop off — so no `maxLength`, which would cut a paste first), offers the number pad, and carries `pattern` so a plain
 * `<form>` refuses anything that is not a whole mobile number. Controlled (`value` + `onValue`) or not (`name` + `defaultValue`).
 * Once the box is left half-typed it says so (`aria-invalid`).
 */
export function PhoneInput({ value, defaultValue, onValue, onChange, onBlur, className, placeholder = "98400 12345", ...p }: Props) {
  const [left, setLeft] = useState(false);
  const [own, setOwn] = useState(phone10(String(defaultValue ?? "")));
  const shown = value !== undefined ? phone10(value) : own;
  const bad = left && !okPhone(shown);
  return (
    <input
      {...p}
      type="tel"
      inputMode="numeric"
      autoComplete={p.autoComplete ?? "tel-national"}
      /* no maxLength: it would cut a pasted "+91 98765 43210" to "+91 98765 " before phone10 sees it — phone10 stops at ten */
      pattern={MOBILE_PATTERN}
      title={p.title ?? MOBILE_HINT}
      placeholder={placeholder}
      className={["num", className].filter(Boolean).join(" ")}
      value={shown}
      aria-invalid={bad || undefined}
      data-phone-input
      onChange={(e) => {
        const v = phone10(e.target.value);
        if (value === undefined) setOwn(v);
        onValue?.(v);
        if (onChange) { e.target.value = v; onChange(e); }
      }}
      onBlur={(e) => { setLeft(true); onBlur?.(e); }}
    />
  );
}
/** Field ties its label to this box as it does a plain input. */
(PhoneInput as unknown as { fieldControl: boolean }).fieldControl = true;
