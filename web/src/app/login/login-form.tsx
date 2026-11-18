"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/forms";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4" data-role="SUPER_ADMIN">
      <input type="hidden" name="next" value={next} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <Field label="School code">
        <Input name="schoolCode" placeholder="e.g. GREENWOOD" autoCapitalize="characters" autoComplete="organization" defaultValue={state?.schoolCode ?? ""} className="uppercase placeholder:normal-case" />
      </Field>
      <Field label="Username or student ID">
        <Input name="username" required autoComplete="username" defaultValue={state?.username ?? ""} />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" required autoComplete="current-password" />
      </Field>
      <SubmitButton className="w-full py-2.5">Sign in</SubmitButton>
    </form>
  );
}
