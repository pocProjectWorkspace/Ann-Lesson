"use client";

import { useActionState, useEffect, useState } from "react";
import { login } from "./actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/forms";

type Options = { mode: "FORM" | "MICROSOFT" | "GOOGLE"; provider: string | null; name: string; studentsSso: boolean; brandColor?: string | null; logoUrl?: string | null };

function ProviderMark({ provider }: { provider: string }) {
  if (provider === "Microsoft")
    return (
      <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    );
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.2 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-3.7-13.6-9l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function LoginForm({ next, initialSchool = "" }: { next: string; initialSchool?: string }) {
  const [state, action] = useActionState(login, undefined);
  const [schoolCode, setSchoolCode] = useState(state?.schoolCode ?? initialSchool);
  // Options are remembered with the code they were fetched for, so typing a different
  // code hides the provider button without a synchronous state reset.
  const [fetched, setFetched] = useState<{ code: string; options: Options | null }>({ code: "", options: null });
  const code = schoolCode.trim().toUpperCase();
  const options = fetched.code === code ? fetched.options : null;

  // Ask how this school signs in once the code looks complete, so the provider button
  // can appear for staff. Schools on form login see no difference.
  useEffect(() => {
    if (code.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/auth/login-options?code=${encodeURIComponent(code)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((o: Options | null) => setFetched({ code, options: o }))
        .catch(() => {});
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [code]);

  const sso = options && options.mode !== "FORM" ? options : null;
  const ssoHref = sso ? `/api/auth/sso/start?school=${encodeURIComponent(code)}${next ? `&next=${encodeURIComponent(next)}` : ""}` : null;
  const brand = options?.brandColor ? ({ "--accent": options.brandColor, "--accent-soft": options.brandColor + "22" } as React.CSSProperties) : undefined;

  return (
    <form action={action} className="space-y-4" data-role="SUPER_ADMIN" style={brand}>
      {options && (
        <div className="flex items-center gap-3 rounded-2xl border border-ink-200/80 bg-white px-3.5 py-2.5 shadow-card" aria-live="polite">
          {options.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={options.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
          ) : (
            <span aria-hidden className="grid h-10 w-10 place-items-center rounded-lg bg-accent font-display text-lg font-bold text-accent-fg">
              {options.name.slice(0, 1)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-display text-[17px] font-bold text-ink-950">{options.name}</span>
            <span className="block text-xs text-ink-500">Signing in to this school</span>
          </span>
        </div>
      )}
      <input type="hidden" name="next" value={next} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <Field label="School code">
        <Input name="schoolCode" placeholder="e.g. GREENWOOD" autoCapitalize="characters" autoComplete="organization" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value)} className="uppercase placeholder:normal-case" />
      </Field>
      {sso && ssoHref && (
        <div className="space-y-2 rounded-[var(--radius-card)] border border-ink-200/80 bg-paper/70 p-3">
          <a href={ssoHref} className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-card transition hover:bg-ink-100">
            <ProviderMark provider={sso.provider ?? ""} />
            Sign in with {sso.provider}
          </a>
          <p className="text-xs text-ink-500">{sso.studentsSso ? `Staff and students of ${sso.name} can use the school account. The form below also works for students.` : `Teachers and admins of ${sso.name} use the school account. Students sign in below with their student ID.`}</p>
        </div>
      )}
      <Field label={sso ? "Student ID" : "Username or student ID"}>
        <Input name="username" required autoComplete="username" defaultValue={state?.username ?? ""} />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" required autoComplete="current-password" />
      </Field>
      <SubmitButton className="w-full py-2.5">Sign in</SubmitButton>
    </form>
  );
}
