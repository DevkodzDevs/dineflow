"use client";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "./index";

/**
 * A password box with a reveal control, for every screen that asks for one.
 *
 * The eye is a button, not a decoration: it is reachable by keyboard, it says what it will do
 * rather than what it shows, and aria-pressed tells a screen reader which state it is in. Revealing
 * puts the password on screen in plain text, so the label flips to "Hide password" and the field
 * announces itself as visible.
 */
export function PasswordInput({ className, wrapClassName, ...props }:
  React.InputHTMLAttributes<HTMLInputElement> & { wrapClassName?: string }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div className={cn("relative", wrapClassName)}>
      <input
        {...props}
        id={props.id ?? id}
        type={shown ? "text" : "password"}
        className={cn("!pr-11", className)}
        // a revealed password must never be offered to the browser's autofill store as a new secret
        autoComplete={props.autoComplete ?? "current-password"}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-controls={props.id ?? id}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 grid place-items-center rounded-[10px]
                   text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 transition-colors"
      >
        {shown ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
