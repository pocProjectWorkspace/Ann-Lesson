# Security summary

A short description of how the Lesson Plan platform protects school data, written for school IT staff. Last updated: [date].

## Architecture

- A web application (Next.js) and a PostgreSQL database hosted with [hosting provider, region]; books, teacher recordings and database backups in object storage with [object storage provider, region].
- One codebase and one database serve all schools. Every row that belongs to a school carries the school's identifier, and every query is scoped to the signed-in person's school and role.
- The mobile app talks to the same server over HTTPS using a bearer token and opens books in a web view with a short-lived hand-off token.

## Identity and access

- Four roles for a school: administrator, teacher, student, parent, plus the platform owner. Access to every page and API route is checked against the role, and then against the person's school and class.
- Passwords are stored as bcrypt hashes. Sessions are server-side records referenced by a signed cookie; signing out or a password reset revokes them. Login attempts are rate-limited per address and per account.
- Optional single sign-on per school with Microsoft Entra ID or Google Workspace (OpenID Connect with PKCE). Group claims can map staff to administrator or teacher roles. A break-glass administrator account remains available to the school.
- Students sign in with a school code, a student ID and a password set by the school; there is no self-registration anywhere on the platform.

## Data protection in the application

- Books are served only through an authenticated route that checks the person's class and school; direct links to storage are short-lived signed URLs. Downloading originals is limited to school administrators and the owner.
- Uploads are checked for type and size before being stored; PDFs are validated by signature.
- Cross-site request forgery is prevented by origin checks on all state-changing requests; security headers (content security policy, frame denial, strict transport security, no sniffing) are set on every response; CSV exports neutralise spreadsheet formulas.
- All administrator and teacher actions that change data are recorded in an activity log the school can read.
- Early-support flags, reading statistics and rankings are visible only inside the school; nothing is shared between schools or with third parties.

## Children's data minimisation

- No advertising, analytics or tracking cookies. No photographs or video. No free-text messaging between children and others. Children cannot publish outside their school.
- Reading time is measured only while a book is on screen and capped per page, and is used only for the teacher's view of the class.

## Operations

- All traffic is encrypted in transit (TLS). Data at rest is encrypted by the hosting and storage providers.
- The database is backed up nightly to object storage; 30 days of backups are kept. Restore is tested [quarterly].
- Dependencies are monitored for vulnerabilities (automated dependency updates) and the application is deployed from a continuous integration pipeline that runs the test suite, including tenant-isolation tests, on every change.
- Access to production systems is limited to [named roles], uses multi-factor authentication at the providers, and is logged.
- Incident response: suspected breaches are investigated immediately; affected schools are notified within [48] hours with what is known, and kept informed.

## Data lifecycle

- Schools export any child's complete data as one file, correct it, or delete it with one action; deletion cascades to every record about the child.
- When a subscription ends the school may export its data for [30] days; then it is deleted, and from backups within a further 30 days.

## Contact

Security questions and vulnerability reports: [security email]. We acknowledge reports within [2] working days.
