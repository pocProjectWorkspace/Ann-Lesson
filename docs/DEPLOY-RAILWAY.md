# Deploy on Railway with Cloudflare R2

Target setup: the web app and Postgres run on Railway; every PDF lives in a
Cloudflare R2 bucket and is served to students straight from R2, so Railway
never pays egress for the books.

Expected cost at launch: Railway about $15 to $25 a month (Hobby plan plus
usage), R2 a few cents for storage and nothing for downloads.

Everything below is done once. Later releases are a `git push`.

## 1. Cloudflare R2 (the PDF store)

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**.
   Name it e.g. `lessonplan-files`. Location: Automatic.
2. **Manage R2 API Tokens** → **Create API token**.
   Permissions: *Object Read & Write*, scoped to that one bucket.
   Copy the **Access Key ID**, **Secret Access Key** and the
   **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).
3. Bucket → **Settings** → **CORS policy** → add:

   ```json
   [
     {
       "AllowedOrigins": ["https://YOUR-APP-DOMAIN"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["Range", "If-None-Match", "Content-Type"],
       "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Content-Disposition"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Put the app's real address in `AllowedOrigins` (the Railway domain at
   first, your own domain later; both can be listed). Without this rule the
   book viewer cannot read the PDF that R2 hands it.

Why CORS is needed: the app's file route checks the login, then redirects
the browser to a five-minute signed R2 URL. The viewer downloads from R2
directly, which is a cross-origin request.

## 2. Railway project

1. railway.com → **New Project** → **Deploy from GitHub repo** → pick
   `pocProjectWorkspace/Ann-Lesson`. Railway creates a service for it.
2. Service → **Settings**:
   - **Root Directory**: `web`
   - Builder is detected from `web/railway.json` (Dockerfile). Health check
     path `/api/health` and restart policy come from the same file.
3. **+ New** → **Database** → **PostgreSQL**. Railway creates a `Postgres`
   service and a `DATABASE_URL` reference you can use from the web service.
4. Web service → **Settings** → **Networking** → **Generate Domain**. Note
   the `*.up.railway.app` address; you can attach your own domain here later.

## 3. Variables on the web service

Service → **Variables** → **Raw Editor**, paste and fill in:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
AUTH_SECRET=<run: cd web && npm run secret>
APP_ORIGINS=<your-app>.up.railway.app
SUPER_ADMIN_EMAIL=<your email>
SUPER_ADMIN_PASSWORD=<strong password, 10+ characters>

STORAGE_DRIVER=s3
S3_BUCKET=lessonplan-files
S3_REGION=auto
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=<from the R2 token>
S3_SECRET_ACCESS_KEY=<from the R2 token>

MAX_UPLOAD_MB=500
NEXT_PUBLIC_MAX_UPLOAD_MB=500
PUSH_ENABLED=1
NODE_ENV=production
```

Optional:

```
ERROR_WEBHOOK_URL=<Slack/Discord/Teams webhook, receives a JSON post per server error>
APP_VERSION=${{RAILWAY_GIT_COMMIT_SHA}}
CORS_ORIGINS=<origin of a separately hosted mobile web build, if any>
```

Notes:

- `APP_ORIGINS` is the list of hostnames (no `https://`) the app is served
  from. Requests whose origin is not listed are refused by the CSRF guard.
  Add your custom domain here when you attach it, comma-separated.
- Do not set `PORT`. Railway injects it and the server listens on it.
- `NEXT_PUBLIC_MAX_UPLOAD_MB` is baked in at build time, so changing it
  needs a redeploy; `MAX_UPLOAD_MB` alone is enough for the server limit.

## 4. First deploy

Railway builds the Docker image and starts it. On start the container runs
the database migrations and creates the platform owner account from
`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` if none exists. Watch
**Deployments → View logs** for:

```
Applying database migrations...
Ensuring the platform owner account exists...
▲ Next.js ... Ready
```

Then open `https://<your-app>.up.railway.app/api/health`. It should return
`{"ok":true,"db":"up",...}`.

Sign in with the owner email, leaving the school code blank. Create the
first school, sign in as its admin, upload a PDF, and open it as a student
to confirm the R2 path works end to end (the book should render; if it
shows "could not load", check the CORS rule from step 1).

## 5. Backups and restore

**Database.** The app dumps its own database with `pg_dump` (custom format, compressed)
straight into the R2 bucket under `_backups/db/`, keeping 30 days (`BACKUP_KEEP_DAYS`).
It runs nightly at 21:30 UTC from the GitHub Actions workflow `.github/workflows/backup.yml`,
which calls `POST /api/admin/backup` with the `BACKUP_TOKEN` secret (set the same value as
a Railway variable on the web service and as a GitHub Actions secret). The platform owner
can also press **Back up now** on the owner home page and sees the list of dumps there.
Every run writes an audit entry (`backup.run` or `backup.failed`).

**Books and recordings** live in R2, which has no object versioning. They are deleted
only by an explicit admin action. If you want a second copy, run a periodic
`aws s3 sync s3://ann-lesson s3://<other-bucket> --endpoint-url <r2 endpoint>` from
any machine with the R2 credentials.

**Restore a database dump** (for example after a bad migration):

1. Download the dump: `aws s3 cp s3://ann-lesson/_backups/db/db-<stamp>.dump . --endpoint-url https://<account>.r2.cloudflarestorage.com`
2. Get the public database URL from Railway (Postgres service → Connect) and restore
   into an empty database, or into the live one after taking a fresh dump:
   `pg_restore --clean --if-exists --no-owner --no-privileges --dbname "<DATABASE_URL>" db-<stamp>.dump`
3. Redeploy the web service (it runs `prisma migrate deploy` on start) and sign in.

Test a restore into a scratch Postgres at least once a quarter so the day it matters is not the first time.

## 6. Custom domain (optional, recommended)

1. Railway web service → **Settings → Networking → Custom Domain** → enter
   `app.yourdomain.com`. Railway shows a CNAME target.
2. In Cloudflare DNS add that CNAME (proxy status: DNS only, or proxied if
   you want Cloudflare's shield in front).
3. Add the domain to `APP_ORIGINS` on Railway and to the R2 CORS
   `AllowedOrigins`.

## 7. Releases

Push to `main`; Railway rebuilds and deploys. Migrations run automatically
at start. If a deploy fails its health check, Railway keeps the previous
one serving and shows the logs.

## 8. Mobile app

Point the apps at production before building them:

```
# mobile/.env
EXPO_PUBLIC_API_URL=https://app.yourdomain.com
```

Then follow `mobile/README.md` for the EAS build. Push notifications work
as soon as `PUSH_ENABLED=1` is set on the server.

## Costs to watch

| Item | What drives it | Typical |
|---|---|---|
| Railway web service | RAM/CPU hours | $5 to $10 |
| Railway Postgres | RAM/CPU hours + disk | $5 to $10 |
| Railway egress | HTML, API and thumbnails only, PDFs come from R2 | under $1 |
| R2 storage | GB stored × $0.015 | 20 GB ≈ $0.30 |
| R2 downloads | free | $0 |

If Railway egress ever grows, check that `STORAGE_DRIVER=s3` is set; with
the `local` driver the server would stream every PDF itself.
