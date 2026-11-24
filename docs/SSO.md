# Single sign-on for schools

Each school has one sign-in method, chosen by the platform owner when the school is
created and changeable later on the school's page under **Sign-in**:

| Method | Staff (admins, teachers) | Students |
| --- | --- | --- |
| School code and password | Username and password | Student ID and password |
| Microsoft | "Sign in with Microsoft" (Entra ID / Microsoft 365) | Student ID and password, or Microsoft if *Students may also sign in* is on |
| Google | "Sign in with Google" (Google Workspace) | Student ID and password, or Google if that option is on |

Rules that hold for every SSO school:

- The first school admin created with the school is the **break-glass** account. Its
  password always works, whatever the method, so a provider problem never locks the
  school out. It is marked on the owner's school page.
- Other staff of an SSO school cannot use the password form; they are told to use the
  provider button.
- People are matched to the provider by their provider id, and on first sign-in by email.
  A teacher the school admin created earlier with the same email is linked, not duplicated.
- With *Create teacher accounts automatically* on, anyone from the school's organisation
  becomes a teacher on first sign-in unless the **Teachers** list restricts it. Anyone in
  the **School admins** list becomes a school admin.
- Every first sign-in and account link is written to the school's activity log.
- Use **Test connection** on the school's page before telling the school. It opens the
  provider, and shows who you signed in as and what role they would get. Nothing is created.

The redirect URI to register with either provider is

```
https://<your app host>/api/auth/sso/callback
```

For the live site that is `https://ann-lesson-production.up.railway.app/api/auth/sso/callback`.

## Microsoft (Entra ID / Microsoft 365)

Done by someone with Global Administrator or Application Administrator in the school's tenant.

1. Entra admin centre → **Identity → Applications → App registrations → New registration**.
   Name: `Ann Lesson`. Supported account types: *Accounts in this organizational directory only*.
   Redirect URI: platform **Web**, the URI above. Register.
2. On the Overview page copy **Application (client) ID** and **Directory (tenant) ID**.
3. **Certificates & secrets → New client secret**. Choose 24 months. Copy the **Value**
   immediately; it is shown once. Put a reminder in the calendar for its expiry.
4. **Token configuration → Add groups claim → Security groups**, and under *ID* pick
   **Group ID**. This puts the user's groups in the token so the admin and teacher lists
   can use group ids. Without it, use email addresses in those lists instead.
5. **API permissions**: `openid`, `profile`, `email` under Microsoft Graph delegated
   permissions are enough. Click **Grant admin consent** so staff do not see a consent prompt.
6. In Ann Lesson, on the school's page: method **Microsoft**, paste the tenant id, client
   id and secret. School admins: the object id of the admins group (Entra → Groups) or
   their emails. Teachers: a group id, or blank to allow all staff.
7. **Test connection**, sign in with a teacher account, check the result page.

Microsoft enforces the school's own MFA and conditional access policies during sign-in.
Ann Lesson adds nothing on top.

## Google Workspace

Done by a Google Workspace super admin, in Google Cloud console with the school's account.

1. console.cloud.google.com → create or pick a project, e.g. `Ann Lesson`.
2. **APIs & Services → OAuth consent screen**. User type **Internal** (so only the school's
   domain can sign in). App name `Ann Lesson`, support email, developer email. Scopes:
   `openid`, `email`, `profile`. Save.
3. **Credentials → Create credentials → OAuth client ID**. Application type **Web application**.
   Authorised redirect URI: the URI above. Create, then copy the **Client ID** and **Client secret**.
4. In Ann Lesson: method **Google**, Workspace domain (the part after `@` in staff emails),
   client id and secret. Google does not put groups in the token, so the admin and teacher
   lists take email addresses. Leave Teachers blank to allow every staff account on the domain.
5. **Test connection** with a teacher's Google account.

The `hd` (hosted domain) claim is checked on every sign-in, so personal Gmail accounts are refused.

## Switching an existing school to a provider

1. Make sure every teacher has their work email filled in on the Teachers page; that is
   how their existing account is matched on first provider sign-in.
2. Set the method and details on the school's page, run Test connection.
3. Tell staff to use the provider button from now on. Their old passwords stop working for
   them; the break-glass admin keeps theirs. Students are unaffected.

## Mobile app

The app shows the same provider button once a school code of an SSO school is typed.
It opens the provider in a secure in-app browser and returns with a session token; the
app never sees the user's password. The app's URL scheme is `lessonplan://`.

## Troubleshooting

| Message on the login page | Cause | Fix |
| --- | --- | --- |
| The school's sign-in provider returned an error | Wrong tenant id, client id, secret, or an unregistered redirect URI | Check the four values; the redirect URI must match exactly |
| This Microsoft account belongs to a different organisation | The person signed in with a personal or another tenant's account | Pick the school account at the Microsoft prompt |
| Use a `<domain>` Google account | Personal Gmail used | Same |
| Your account is not set up for this school | Not in any admin or teacher list and auto-provision is off | Add them to a list, or add them on the Teachers page with their email |
| Students sign in with their student ID | A student's email matched but student SSO is off | Turn on *Students may also sign in* or use the form |
