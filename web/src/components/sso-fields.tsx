"use client";

import { useState } from "react";
import { Field, Input, Select } from "./ui";

export type SsoDefaults = {
  authMode?: string;
  ssoTenant?: string | null;
  ssoClientId?: string | null;
  hasSecret?: boolean;
  ssoAdminGroups?: string | null;
  ssoTeacherGroups?: string | null;
  ssoAutoProvision?: boolean;
  ssoStudents?: boolean;
};

/**
 * The owner's sign-in settings for a school: the method, and the provider details when
 * it is Microsoft or Google. Used on the create-school form and the school page.
 */
export function SsoFields({ defaults = {} }: { defaults?: SsoDefaults }) {
  const [mode, setMode] = useState(defaults.authMode ?? "FORM");
  const sso = mode !== "FORM";
  const ms = mode === "MICROSOFT";
  return (
    <>
      <Field label="Sign-in method" hint="Staff of a Microsoft or Google school sign in with the school account. Students keep their student ID and password.">
        <Select name="authMode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="FORM">School code and password</option>
          <option value="MICROSOFT">Microsoft (Entra ID / Microsoft 365)</option>
          <option value="GOOGLE">Google Workspace</option>
        </Select>
      </Field>
      {sso && (
        <div className="space-y-4 rounded-[var(--radius-card)] border border-ink-200/80 bg-paper/60 p-4">
          <p className="text-xs text-ink-500">
            Redirect URI to register with the provider: <code className="rounded bg-white px-1 py-0.5">{typeof window !== "undefined" ? window.location.origin : ""}/api/auth/sso/callback</code>. Setup steps are in <code>docs/SSO.md</code>.
          </p>
          <Field label={ms ? "Directory (tenant) ID" : "Google Workspace domain"} hint={ms ? "From Entra admin centre → Overview. A GUID." : "The part after @ in staff emails, e.g. sunschool.ae"}>
            <Input name="ssoTenant" required={sso} defaultValue={defaults.ssoTenant ?? ""} placeholder={ms ? "00000000-0000-0000-0000-000000000000" : "school.example"} />
          </Field>
          <Field label="Client ID" hint={ms ? "Application (client) ID of the app registration." : "OAuth client ID from Google Cloud console."}>
            <Input name="ssoClientId" required={sso} defaultValue={defaults.ssoClientId ?? ""} autoComplete="off" />
          </Field>
          <Field label="Client secret" hint={defaults.hasSecret ? "A secret is stored. Leave blank to keep it." : "Stored encrypted; shown once by the provider, never shown here."}>
            <Input name="ssoClientSecret" type="password" required={sso && !defaults.hasSecret} autoComplete="new-password" placeholder={defaults.hasSecret ? "••••••••" : ""} />
          </Field>
          <Field label="School admins" hint={ms ? "Group object IDs or email addresses, comma-separated. Anyone matching becomes a school admin." : "Email addresses, comma-separated. Anyone matching becomes a school admin."}>
            <Input name="ssoAdminGroups" defaultValue={defaults.ssoAdminGroups ?? ""} placeholder={ms ? "group-id, head@school.example" : "head@school.example"} />
          </Field>
          <Field label="Teachers" hint="Group IDs or emails, comma-separated. Leave blank to let every staff account from this organisation sign in as a teacher.">
            <Input name="ssoTeacherGroups" defaultValue={defaults.ssoTeacherGroups ?? ""} />
          </Field>
          <label className="flex items-start gap-2 text-sm text-ink-700">
            <input type="checkbox" name="ssoAutoProvision" value="yes" defaultChecked={defaults.ssoAutoProvision ?? true} className="mt-1" />
            <span>Create teacher accounts automatically on first sign-in. Off means only people already added by the school admin, matched by email, can sign in.</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-ink-700">
            <input type="checkbox" name="ssoStudents" value="yes" defaultChecked={defaults.ssoStudents ?? false} className="mt-1" />
            <span>Students may also sign in with the provider. They must already exist with the matching email; the form stays available for everyone.</span>
          </label>
        </div>
      )}
    </>
  );
}
