"use client";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Wand2 } from "lucide-react";
import { Field, cn } from "@/components/ui";
import { loginAddressProblem, suggestLoginId, toLoginAddress, type PropertyType } from "@dineflow/shared";
import { checkLoginId } from "./actions";

/**
 * The sign-in id box.
 *
 * Typing a bare word is enough — the house domain is shown attached to the field and added on save.
 * Typing a full address is also fine and is left exactly as it is, so a property can sign in with a
 * real mailbox. The line under the field always states the address that will actually be created,
 * because the two differ often enough that guessing is unfair.
 *
 * Suggestions are built from the property name and the owner's name, with no dashes:
 *   "Tan Resort" + "Priya Kumar"  →  tanresortpriya
 */
export function LoginIdField({ value, onChange, name, type, ownerName }:
  { value: string; onChange: (v: string) => void; name: string; type: PropertyType; ownerName?: string }) {
  const [state, setState] = useState<{ ok: boolean; note: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  const suggestion = suggestLoginId(name, type, ownerName);
  const problem = loginAddressProblem(value);
  const preview = toLoginAddress(value);
  const typedOwnDomain = value.includes("@");

  useEffect(() => {
    setState(null);
    if (problem) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setChecking(true);
      const r = await checkLoginId(value);
      if (mine !== seq.current) return;
      setChecking(false);
      setState("error" in r ? { ok: false, note: r.error! } : { ok: r.ok, note: r.note });
    }, 450);
    return () => clearTimeout(t);
  }, [value, problem]);

  const hint = value.trim() === ""
    ? "Leave this blank and a numbered DineFlow code is assigned automatically."
    : typedOwnDomain
      ? "You typed a full address, so it is used as it is."
      : "@dineflow.local is added for you.";

  return (
    <Field label="Sign-in ID" hint={hint}>
      <div className="flex items-stretch">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={suggestion || "tanresortpriya"}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          className={cn("num !rounded-r-none flex-1 min-w-0", problem && "!border-chili")}
        />
        {!typedOwnDomain && (
          <span className="shrink-0 grid place-items-center px-3 text-sm text-steel num
                           border border-l-0 border-line rounded-r-[12px] bg-[var(--color-fill)]">
            @dineflow.local
          </span>
        )}
      </div>

      {suggestion && value.trim() === "" && (
        <button type="button" onClick={() => onChange(suggestion)}
          className="mt-2 chip inline-flex items-center gap-1.5">
          <Wand2 size={13} /> Use <span className="num">{suggestion}</span>
        </button>
      )}

      <p className={cn("mt-2 text-xs flex items-start gap-1.5",
        problem || state?.ok === false ? "text-chili" : state?.ok ? "text-[var(--color-green)]" : "text-steel")}>
        {problem ? <><CircleAlert size={13} className="mt-px shrink-0" />{problem}</>
          : value.trim() === "" ? <>Will be assigned on save.</>
          : checking ? <>Checking <span className="num">{preview}</span></>
          : state
            ? <>{state.ok ? <Check size={13} className="mt-px shrink-0" /> : <CircleAlert size={13} className="mt-px shrink-0" />}
                <span><span className="num">{preview}</span> — {state.note}</span></>
            : <>Will be created as <span className="num ml-1">{preview}</span></>}
      </p>
    </Field>
  );
}
