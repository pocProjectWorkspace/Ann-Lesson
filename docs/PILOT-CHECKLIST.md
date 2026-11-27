# Pilot checklist

What to do, in order, before the first real school uses the platform. Items marked
**(you)** need the owner's own hands or accounts; the rest is done or automated.

## 1. Production hygiene

- [ ] **(you)** Change the owner password. Sign in at https://ann-lesson-production.up.railway.app as the owner, open **Account** (your name in the sidebar), set a new password. The one shown in chat during setup is in a transcript and must not stay in use.
- [x] Nightly database backups. The GitHub Actions workflow `backup.yml` runs at 21:30 UTC and asks the app to dump the database into object storage under `_backups/db/` (30 days kept). You can also press **Back up now** on the owner home page, and see the list there. Restore steps: `docs/DEPLOY-RAILWAY.md`.
- [ ] **(you)** Confirm the first nightly run succeeded: GitHub → Actions → "Nightly database backup" should be green tomorrow morning, and the owner home page should list a dump.
- [ ] Object storage: Cloudflare R2 has no object versioning. Books are only ever deleted by an explicit admin action, and the database dump records which files exist. For belt and braces, enable **R2 → bucket → Settings → Object lifecycle** with no expiry rule (the default), and keep the R2 token scoped to the single bucket as it is now.
- [ ] **(you)** Turn on two-factor authentication on the Railway, Cloudflare and GitHub accounts that hold production.

## 2. Single sign-on round trip with a real provider

The SSO code is tested against a simulated provider in CI. Do one real round trip per provider you will sell.

**Microsoft Entra ID (test tenant)**

1. In https://entra.microsoft.com, App registrations → New registration. Name "Lesson Plan", single tenant. Redirect URI (Web): `https://ann-lesson-production.up.railway.app/api/auth/sso/callback`.
2. Certificates & secrets → New client secret; copy the value.
3. Token configuration → Add groups claim → Security groups (group ID). Create two security groups, "LP Admins" and "LP Teachers", and add a test user to each.
4. In the platform, as owner: Schools → the test school → Sign-in: Microsoft, tenant = the Directory (tenant) ID, client ID, client secret, admin groups = the LP Admins group ID, teacher groups = the LP Teachers group ID, auto-provision on.
5. Open the login page, type the school code, press **Sign in with Microsoft**, sign in as the test user. Expect to land on the teacher or admin home with the right role. Then remove the user from both groups and sign in again: expect "not allowed into the school".

**Google Workspace**

1. https://console.cloud.google.com → APIs & Services → Credentials → OAuth client ID (Web). Authorised redirect URI as above. Configure the consent screen as Internal.
2. In the platform: Sign-in: Google, client ID and secret, allowed domain = the workspace domain.
3. Same round trip as above with a workspace user.

Full reference: `docs/SSO.md`.

## 3. The teacher's day, on production, with your own books

Create a demo school (or use the one you have), upload two real PDFs, and do each of these on the devices the school will actually use (a classroom board or large screen, a child's tablet, a teacher's phone). Note anything slow or confusing.

- [ ] School admin: create a class, a subject, a lesson; upload the PDF; **Publish**.
- [ ] Teacher, on the board: open the lesson on the **smart board**; turn pages; pen, highlighter, crayon, fill; spotlight; timer; pick a child.
- [ ] Teacher phone: **Board remote** → page turns and **Students follow**.
- [ ] Child tablet: sign in as a student; the book opens; the shelf shows the cover; follow mode moves the page.
- [ ] Board: **Send page to desks** with an instruction; child draws and sends; the wall shows it; enlarge; close.
- [ ] Child: **Colour** a page; fill a shape; it stays coloured after reopening.
- [ ] Teacher: **Record read to me** for two pages; child presses **Read to me**; the page turns itself.
- [ ] Teacher: **Stickers** → give one with a note; the child's shelf shows it; the celebration appears when a badge is earned (finish a book).
- [ ] Teacher: **Grades and ranking** → rate a few children; **Page insights** on the lesson; the **Needs a hand** card.
- [ ] School admin: **Families** → add a parent linked to the child; sign in as the parent; **Read together tonight** opens the book read-only.
- [ ] Mobile app: sign in as teacher, student and parent; open a book; board remote.
- [ ] Data: export a child's data (Students → Export data); delete a test child and confirm the parent no longer sees them.

Time how long the PDF upload and first open take on the school's connection; that number is the first thing a principal will notice.

## 4. Legal pack

Published drafts (placeholders in brackets to complete, then a lawyer's review): /legal/terms, /legal/privacy, /legal/dpa, /legal/security. Sources: `web/content/legal/*.md`.

- [ ] **(you)** Fill in operator name, address, jurisdiction, emails, hosting provider names and regions.
- [ ] **(you)** Lawyer review in the pilot school's country (children's data rules differ by country).
- [ ] Hand the DPA and the Security summary to the pilot school's IT and data protection contact before go-live.
