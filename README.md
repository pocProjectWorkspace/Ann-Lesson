# Lesson Plan — multi-tenant school lesson platform

Each school is a tenant with its own admin, teachers, students and syllabus
(classes → subjects → lessons → PDF files).

- `web/` — Next.js web app for everyone, plus the JSON API used by the mobile app.
- `mobile/` — Expo / React Native app for teachers and students (see `mobile/README.md`).
- `docker-compose.prod.yml`, `web/Dockerfile` — production deployment (see Deploy with Docker).
- `.github/workflows/ci.yml` — lint, type-check, unit and API tests, Docker build on every push.

## Mobile API (used by the app)

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/mobile/login` | teacher, student | Returns a bearer token and the user profile |
| `GET /api/mobile/me` | teacher, student | Current user, school, class |
| `GET /api/mobile/home` | teacher, student | Student: subjects and lessons with progress. Teacher: classes |
| `GET /api/mobile/classes/:id` | teacher | Subjects and lessons with class-wide counts |
| `GET /api/mobile/lessons/:id` | teacher, student | Lesson, files, progress (own or per student) |
| `POST /api/mobile/lessons/:id/learnt` | student | `{ "learnt": true }` or `false` |
| `POST /api/mobile/logout` | teacher, student | Revokes this device's session |
| `POST /api/mobile/password` | teacher, student | `{ currentPassword, newPassword }`; signs out other devices |
| `POST /api/mobile/webview-token` | teacher, student | 10-minute hand-off token; `/embed/viewer/:fileId?t=…` and `/api/files/:id?t=…` accept it |
| `GET /api/auth/webview?t=…&next=…` | app web view | Turns that token into the session cookie and redirects |
| `GET /api/files/:id` | all | PDF bytes; accepts the bearer token or the cookie |

All endpoints return JSON errors as `{ "error": "message" }` with 400, 401, 403 or 404.

## Roles

| Role | Logs in with | Can do |
|---|---|---|
| Platform owner (super admin) | email + password, school code left blank | Create schools, add school admins, activate/deactivate schools |
| School admin | school code + username + password | Manage teachers, students, classes, subjects, lessons, PDFs |
| Teacher | school code + username + password | View syllabus of assigned classes and per-student progress |
| Student | school code + student ID + password | View lessons of own class, open PDFs, mark lessons as learnt |

## Stack

- Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4
- PostgreSQL 16 via Prisma 6
- Session: signed JWT in an HttpOnly cookie (`jose`), passwords hashed with bcrypt
- File storage: local disk in development, any S3-compatible bucket in production
  (switch with `STORAGE_DRIVER=s3`)

## Run locally

Requirements: Node 20+, Docker Desktop.

```bash
# 1. Start PostgreSQL (port 5434 so it does not clash with other projects)
docker compose up -d

# 2. Install, migrate, seed the platform owner account
cd web
npm install
npx prisma migrate dev
npm run db:seed

# 3. Start the app
npm run dev
```

Open http://localhost:3000 and sign in as the platform owner with the email and
password from `web/.env` (`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`).
Change both before deploying.

## First-time setup in the app

1. Platform owner: create a school. Give it a short code (for example `GREENWOOD`)
   and the first school admin's username and password.
2. School admin: create classes, open a class and add subjects, open a subject and
   add lessons, open a lesson and upload its PDF.
3. School admin: add teachers and assign them to classes. Add students to their
   class, one at a time or by pasting a list.
4. Teachers and students log in with the school code.

## Book-style PDF viewer

Lessons open as a page-turning book (pdf.js renders pages to images, page-flip
animates them). Large scanned books open fast because nothing waits for the whole
file:

- The PDF is opened with HTTP range requests, so only the bytes a page needs are
  downloaded. R2/S3 signed URLs serve ranges natively; the local driver streams
  ranges from disk (`/api/files/[id]` answers `Range` and `HEAD`).
- The book is mounted immediately with a placeholder per page. Pages are rendered
  one at a time starting from the spread the reader is on and working outwards, and
  turning the page re-prioritises the queue. A 370 MB, 106-page scan shows its cover
  in about 10 seconds and keeps rendering in the background.
- Rendered pages are JPEG blobs (1200 px wide on desktop, 800 px on phones), so
  memory stays modest even for long books.
- Students and teachers see a name watermark on every page and have no download.

## Configuration (`web/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | 32+ random characters used to sign sessions |
| `APP_ORIGINS` | Comma-separated public hostnames, e.g. `app.example.com`. Used for CSRF protection in production |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the token API from a browser, e.g. `https://m.example.com` |
| `ALLOWED_DEV_ORIGINS` | Development only. LAN hosts that phones use to reach the dev server, e.g. `192.168.1.20`, so the embedded book viewer can load its scripts. Not used in production |
| `ERROR_WEBHOOK_URL` | Optional webhook that receives a JSON payload for every server error |
| `PUSH_ENABLED`, `EXPO_ACCESS_TOKEN` | Set `PUSH_ENABLED=0` to disable push; the access token is optional |
| `MAX_UPLOAD_MB`, `NEXT_PUBLIC_MAX_UPLOAD_MB` | Largest PDF a school may upload, default 500. Set both to the same value |
| `STORAGE_DRIVER` | `local` or `s3` |
| `UPLOAD_DIR` | Folder for local storage (default `./uploads`) |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3 settings when `STORAGE_DRIVER=s3`. `S3_ENDPOINT` is only needed for non-AWS providers such as Cloudflare R2 (`S3_REGION=auto`). The bucket needs a CORS rule allowing `GET`/`HEAD` from the app origin, because the browser downloads PDFs from the bucket directly; see `docs/DEPLOY-RAILWAY.md` |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Used once by the seed script |

## Project layout

```
docker-compose.yml        PostgreSQL for local development
web/
  prisma/schema.prisma    Data model (School, User, Class, Subject, Lesson, LessonFile, ...)
  prisma/seed.ts          Creates the platform owner
  src/lib/auth.ts         Sessions, password hashing, role guards
  src/lib/storage.ts      Local / S3 file storage
  src/proxy.ts            Route protection by role
  src/app/login           Login page and actions
  src/app/admin           Platform owner screens
  src/app/school          School admin screens and actions
  src/app/teacher         Teacher screens
  src/app/student         Student screens and actions
  src/app/api/files/[id]  Authorised PDF download / streaming
```

## Security model

- **Sessions are server-side.** Every sign-in creates a row in the `Session`
  table; the cookie or mobile bearer token carries that row's id. Every request
  checks the row, so sign-out, password change, deactivating a user or
  deactivating a school take effect immediately on all devices. Users see and
  manage their devices at `/account`.
- **Login rate limiting.** 5 failed attempts per account or 30 per IP address in
  15 minutes pauses sign-in for 15 minutes. The limiter is in-process; put it
  behind Redis if you run more than one app instance.
- **Cross-site request protection.** The proxy refuses any cookie-authenticated
  POST whose `Origin` does not match the host. Set `APP_ORIGINS` to your public
  hostnames in production so Next.js server actions apply the same rule.
- **Password change.** Every role can change their own password at `/account`
  (mobile: `POST /api/mobile/password`). Changing it signs out other devices.
- **Uploads.** PDFs stream to storage through `PUT /api/uploads/lesson-file`
  rather than through a server action, so even a very large file is never held in memory.
  The PDF signature is checked in the browser and again on the server; a
  renamed file is refused.
- **Viewing only for teachers and students.** Both get the book view only, rendered
  from images with their name watermarked across each page, no scroll view, no
  download link, and the file route never sends an attachment disposition to them.
  Only school admins and the platform owner can download. This deters sharing; it is
  not DRM.

## Platform owner

- Creates schools with a plan, raises invoices, activates or deactivates a school, and adds admins.
- **Delete school** appears on a school's page only while it is empty: no classes, subjects, lessons, PDFs, teachers, students or unpaid invoices. Deleting removes the school, its admin accounts and settled invoices, and is recorded in the owner's activity log. A school with data must be emptied first, or deactivated instead.

## School administration features

- **Edit anything.** Classes, subjects and lessons have edit forms. A lesson can be moved to another subject or class.
- **Year rollover.** On a class page, "Move to next year" creates the next class, moves every student, keeps the teachers and optionally copies the whole syllabus including PDFs. The old class stays as the previous year's record.
- **CSV import and export.** Students can be imported from a CSV with a header row (Name, Student ID, Password, Email; a default password fills blanks) or pasted as text. Exports: students, class progress, and for the owner a schools list. A template CSV is downloadable from the Students page.
- **Search and pagination.** Students, teachers, schools and activity logs are searchable and paginated at 50 rows.
- **Notifications.** Students and teachers get in-app notifications (bell in the sidebar, `/notifications`) when a lesson gets its first PDF, when a class is promoted, when a teacher is assigned, and when a teacher confirms a lesson. Mobile: `GET/POST /api/mobile/notifications`.
- **Learnt needs evidence.** A student can mark a lesson learnt only after opening its PDF. A teacher can confirm it, singly or all at once. A confirmed lesson cannot be undone by the student. The progress export shows Viewed, Learnt or Confirmed per lesson.
- **Audit log.** Every admin action is recorded with who, when and what. School admins see their school at `/school/audit`; the owner sees everything at `/admin/audit`.
- **Plans, limits and invoices.** Each school has a plan (Trial 30 days with 5 GB, Basic with 25 GB, Pro with 100 GB, or Custom), an expiry date and limits for students, teachers and storage. Limits are enforced when adding users or uploading. An expired plan pauses additions but not reading. The owner edits plans and raises manual invoices on the school page; the school sees them at `/school/billing`. There is no payment gateway. Invoices are paid outside the app and marked paid by the owner.

## Operations

- **Health**: `GET /api/health` returns 200 with `{"db":"up"}` when the app and database are
  reachable. Docker uses it as the health check; point your uptime monitor at it too.
- **Error reporting**: every server error, API 500 and browser render failure is logged as one
  JSON line to stderr (`src/lib/report-error.ts`). Set `ERROR_WEBHOOK_URL` to also POST each
  error to a Slack, Discord or Teams webhook, or any collector. `APP_VERSION` (for example a
  git SHA) is included in each report.
- **Backups**: `web/scripts/backup.sh` dumps the database (custom format, compressed) and
  archives local uploads, keeps `BACKUP_KEEP_DAYS` days, and copies to `BACKUP_S3_URI` when
  set. The `backup` service in `docker-compose.prod.yml` runs it every 24 hours onto the
  `backups` volume. Restore with `web/scripts/restore.sh <db.dump> [uploads.tar.gz <dir>]`.
- **Secrets**: `web/.env` is git-ignored and holds a random `AUTH_SECRET` generated locally;
  `npm run secret` prints a fresh one. The seed refuses the default owner password in
  production, and the container refuses to start without a real `AUTH_SECRET`.
- **CORS**: the token API (`/api/mobile/*`, `/api/files/*`, `/api/exports/*`) answers CORS for
  origins listed in `CORS_ORIGINS` (and any local-network origin in development). Needed only
  if you host the mobile web build or another front end on a different origin.
- **Push notifications**: in-app notifications are also sent as Expo push messages to every
  registered device (`src/lib/push.ts`). Set `PUSH_ENABLED=0` to turn this off (tests do), and
  `EXPO_ACCESS_TOKEN` if your Expo project requires it.

## Accessibility

The web app was audited with axe-core on the login, owner, school admin, teacher and student
screens with no WCAG 2.1 AA violations remaining. What that covered: landmarks and a skip
link, labelled form controls and icon buttons, table captions and column headers, named
progress bars with values, live page announcements in the book viewer, visible focus, and
colour contrast on both the paper and dark surfaces. Re-run an audit locally by placing
`node_modules/axe-core/axe.min.js` at `web/public/dev-axe.js` (git-ignored) and running
`axe.run()` from the browser console.

## Uploads and memory

The upload route (`PUT /api/uploads/lesson-file`) sits outside the auth proxy on purpose.
When the proxy runs on a request, Next.js buffers the whole body in memory to replay it to
the route; a 300 MB book would then exceed a small container's memory. The route does its
own Origin, session and role checks and streams the body to storage in 8 MB parts, so a
380 MB upload peaks at under 200 MB of server memory.

## Draft and publish

A lesson is a draft until the school admin publishes it. Drafts are visible to admins and
teachers (marked as such) but not to students, and nothing is sent to anyone on upload.
Publishing needs at least one PDF, records an audit entry, and sends the "new lesson"
notification to the class and its teachers. Unpublish hides the lesson again without losing
progress. Lessons copied into a new class at year rollover keep their status.

## Reading progress

Two things are tracked per student and lesson, and they are deliberately separate:

- **Reading position**, reported by the book viewer as pages are turned
  (`POST /api/mobile/lessons/:id/position`): current page, furthest page reached and page
  count. It drives the percentages on the student home, subject and lesson pages, the
  "Continue reading" card (which reopens the book at the last page), the teacher's
  per-student view and the progress CSV. Reaching the last page marks the lesson
  **finished reading**.
- **Learnt**, which the student claims with a button and the teacher can confirm.
  Finishing the book nudges the student to mark it learnt but never does so for them.

The mobile app's embedded viewer reports position with the web-view hand-off token.

## Security headers

Every response carries HSTS, `nosniff`, a referrer policy and a permissions policy.
Pages send `frame-ancestors 'self'`, so no other site can frame them. The embedded
book viewer (`/embed/*`) additionally allows the origins in `CORS_ORIGINS`, which is
where a separately hosted mobile web build lives; in development local origins are
allowed automatically. PDF responses keep their own sandboxing policy.

## Tenant isolation

Every school-scoped table carries `schoolId`. Every query in the school, teacher
and student areas filters by the `schoolId` from the session, and the file route
checks that the requesting user may see that lesson before streaming it. PDFs are
never served from a public URL.

## Tests

```bash
cd web
npm test            # unit tests (CSV parser, PDF signature check, rate limiter)
npm run test:api    # API tests against a running, seeded server (TEST_BASE_URL, default http://localhost:3000)
npm run check       # lint + typecheck + unit tests
```

The API suite covers login, session revocation, cross-site refusal, rate limiting,
tenant isolation across two schools, student download restriction, the
view-before-learnt rule, teacher confirmation, notifications and password change.
It expects the demo data (`npm run db:seed && npm run seed:demo`). CI runs all of
this plus a Docker build on every push; see `.github/workflows/ci.yml`.

## Deploy on Railway + Cloudflare R2 (recommended)

The cheapest managed setup: the app and Postgres on Railway, PDFs in R2 so
downloads are free. Step by step in [docs/DEPLOY-RAILWAY.md](docs/DEPLOY-RAILWAY.md),
including the R2 CORS rule the book viewer needs.

## Deploy with Docker

The web app ships as a single container (Next.js standalone, Node 22, non-root
user, health check on `/api/health`, migrations applied on start).

```bash
cp .env.prod.example .env.prod          # set POSTGRES_PASSWORD, AUTH_SECRET, APP_ORIGINS, SUPER_ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

On every start the container applies pending migrations and, if
`SUPER_ADMIN_PASSWORD` is set and no owner exists yet, creates the platform
owner account. Set `SKIP_MIGRATIONS=1` or `SKIP_SEED=1` to turn either off.

Then put a TLS reverse proxy in front of port 3000 (Caddy needs two lines:
`app.example.com { reverse_proxy web:3000 }`). Uploads live on the `uploads`
volume with the local driver, or set `STORAGE_DRIVER=s3` and the S3 variables
to use a bucket. To run more than one web instance, use S3 and move the login
rate limiter to Redis.

Any host that runs containers works: a single VM with Docker, Railway, Render,
Fly.io, or a managed container service. Point `DATABASE_URL` at a managed
PostgreSQL if you prefer not to run the `db` service.

## Production notes

- Set a strong `AUTH_SECRET`, change the owner password, and set `NODE_ENV=production`
  so the session cookie is marked `secure`.
- Use `STORAGE_DRIVER=s3` so uploads survive redeploys.
- Run `npx prisma migrate deploy` on each release.
- `npm run build && npm start` produces the production server. It runs on any
  Node host or in Docker.

## Troubleshooting

- **Every page reloads once a second in development.** A stale Turbopack cache in `web/.next`. The persisted dev cache is turned off in `next.config.ts` for this reason; if it ever happens anyway, stop the server, delete `web/.next`, start again.
