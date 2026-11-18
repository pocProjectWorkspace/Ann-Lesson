"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Alert, Button } from "./ui";
import type { ActionState } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function SubmitButton({ children, variant, className, ariaLabel }: { children: ReactNode; variant?: Variant; className?: string; ariaLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} className={className} aria-label={ariaLabel} aria-busy={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

/** Generic form wrapper around a server action returning ActionState. */
export function ActionForm({
  action,
  children,
  submitLabel = "Save",
  className,
  resetOnSuccess = true,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.success) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className ?? "space-y-4"}>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.success && <Alert kind="success">{state.success}</Alert>}
      {children}
      <div className="flex justify-end">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** Small inline form for a single destructive or toggle action. */
export function InlineAction({
  action,
  label,
  confirm: confirmText,
  variant = "ghost",
  hidden,
  ariaLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  confirm?: string;
  variant?: Variant;
  hidden?: Record<string, string>;
  ariaLabel?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline"
    >
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={variant} className="px-2 py-1 text-xs" ariaLabel={ariaLabel ?? (label === "×" ? "Remove" : undefined)}>
        {label}
      </SubmitButton>
    </form>
  );
}
