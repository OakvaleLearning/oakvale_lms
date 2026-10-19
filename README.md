# Oakvale LMS

Self-paced learning app for Oakvale Learning. It has two sides:

- **Admin (`/admin`)** — build **Programmes → Courses → Modules → Lessons**, set **tiers** (what learners buy), see learners, progress and payments.
- **Learners (`/learn`)** — enrol and pay (Paystack), then study at their own pace on phone or computer. Installable as an app (PWA).

Lesson types: **Video**, **Audio**, **SCORM 1.2 / 2004**, **HTML** (single file or zip) and **Quiz**.

The marketing site (`learners_portal`) links here with `/enroll?track=<programme-slug>&tier=<tier-slug>`.

## Stack

Next.js 16 (App Router) · React 19 · Prisma 6 + PostgreSQL · Tailwind CSS 4 · jose sessions · Paystack · Resend · Cloudflare R2 (files) · scorm-again (SCORM runtime).

## How it fits together

| Concept | Where |
|---|---|
| Who can open what (enrolment, prerequisites, sequential lessons) | `src/lib/lms/access.ts` |
| Progress (video position, completion, best score) | `src/lib/lms/progress.ts` |
| Quiz grading (server-side; answers never sent to the browser) | `src/lib/lms/quiz.ts` |
| SCORM/HTML package unpacking + `imsmanifest.xml` parsing | `src/lib/lms/packages.ts` |
| SCORM runtime data ↔ progress | `src/lib/lms/scorm.ts`, `src/components/learn/ScormPlayer.tsx` |
| R2 storage | `src/lib/storage.ts` |
| Payments (Paystack verify + webhook, idempotent) | `src/lib/payments.ts` |

**Uploads** go from the admin's browser straight to R2 using a presigned URL, so big videos never pass through Vercel's 4.5 MB request limit. **SCORM/HTML** packages are then unzipped into R2 and served from this app's own domain at `/content/<assetId>/…` — SCORM needs that so the package can reach the runtime API in the parent page. **Video/audio** stream from short-lived signed R2 links.

## Local development

```bash
# 1. Database (Docker)
docker run -d --name oakvale-lms-postgres \
  -e POSTGRES_USER=oakvale -e POSTGRES_PASSWORD=oakvale_lms_dev -e POSTGRES_DB=oakvale_lms \
  -p 5436:5432 postgres:18-alpine

# 2. Environment
cp .env.example .env     # set DATABASE_URL and AUTH_SECRET at minimum

# 3. Install, migrate, seed
npm install
npx prisma migrate dev
npm run seed             # admin + Adult Care / Child Care programmes with tiers + demo learner

# 4. Run (port 3001, so it can run beside the marketing site on 3000)
npm run dev
```

Seeded logins: `admin@oakvalelearning.com` / `admin12345` and (dev only) `learner@example.com` / `learner12345`. **Change the admin password before going live.**

Without Paystack keys, checkout is simulated. Without a Resend key, emails are logged. Without R2 settings, lessons that need files show a notice; quizzes still work. To test uploads locally against an S3-compatible server (e.g. MinIO), set `R2_ENDPOINT`.

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing secret (32+ random characters) |
| `NEXT_PUBLIC_APP_URL` | This app's public URL (used in emails) |
| `NEXT_PUBLIC_MARKETING_URL` | Marketing site URL ("View site" links) |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | Paystack keys |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Transactional email |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2 |
| `R2_ENDPOINT` | Local development only — leave empty in production |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Optional, used by `npm run seed` |

## Cloudflare R2 setup

1. Cloudflare dashboard → **R2** → create a bucket (e.g. `oakvale-lms`). Keep it **private**.
2. **R2 → Manage API tokens** → create a token with *Object Read & Write* on that bucket. Copy the Access Key ID, Secret Access Key and your Account ID.
3. Bucket → **Settings → CORS policy**, so admins' browsers can upload directly:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-LMS-DOMAIN", "http://localhost:3001"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your Vercel preview domain(s) to `AllowedOrigins` if you upload from previews.

## Deploying to Vercel

1. Push this folder to its own GitHub repository and import it as a **new Vercel project**.
2. Add a **Prisma Postgres** database from the Vercel Marketplace (Storage tab) — a separate one from the marketing site.
3. Set the environment variables above (Production and Preview).
4. Deploy. The build runs `prisma migrate deploy` automatically.
5. Seed once against production with real admin credentials:
   `ADMIN_EMAIL=you@… ADMIN_PASSWORD=… NODE_ENV=production npm run seed` (with `DATABASE_URL` pointing at production).
6. In Paystack → Settings → API Keys & Webhooks, set the webhook URL to `https://YOUR-LMS-DOMAIN/api/payments/webhook`.
7. On the marketing site, set `NEXT_PUBLIC_LMS_URL=https://YOUR-LMS-DOMAIN/enroll` and redeploy it.

## Later: native mobile app

The learner side is an installable web app today. A native app (Expo) can reuse the same backend: the logic lives in `src/lib/lms/*`, and progress, quizzes and SCORM already go through JSON API routes under `src/app/api/lms`. SCORM/HTML lessons can run inside a WebView pointed at the lesson page. Keep purchasing on the web; Apple restricts in-app sales of digital content.
