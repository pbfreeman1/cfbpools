# CFBPools.com — Project Context

Two pools, one site. See full requirements in `/docs` (add the original requirements doc here) and the roadmap doc for phased build order.

## Pools
- **SEC Survivor Pool** (build first): pick 1 SEC team/week to win. Lose = eliminated. 16 SEC teams, 14 weeks, so each entry must use a "bonus pick" in exactly 2 weeks of their choosing — bonus weeks require BOTH picked teams to win, or the entry is eliminated. Max 2 entries per user. Entry deadline Sept 5, 12pm.
- **Weekly Pick'em Pool** (build second, spec still evolving): pick 6 games against the spread each week. 6-0 wins the pot; pushes count as losses; unlimited entries per user; picks lock 12pm Saturday.

## Conventions
- Supabase Auth (`auth.users`) + a `profiles` table for app fields — never a custom users table.
- **Email + password auth only** — no magic link, no OAuth/social sign-in (Google, Apple, etc.). Require email confirmation on signup. Build a proper self-service password reset flow (Supabase Auth's `resetPasswordForEmail`) since there's no magic-link fallback — this depends on transactional email working reliably, so don't defer email setup too late.
- Shared `GAMES` table for both pools; `MASTER_TEAMS` is the single source of truth for team data.
- Picks: one current-state table per pool, with a Postgres trigger writing to a `_log` history table on every insert/update. Don't hand-write log-table application logic.
- Lock state is derived from `now() > game.kickoff_time`, not stored as a manually-toggled flag (or flipped by a scheduled Edge Function at kickoff).
- RLS policies are mandatory on every user-data table — write them alongside the schema, not after.
- Primary data source: CFBD API (collegefootballdata.com) for schedules/results/spreads. ESPN's public endpoints are a live-score fallback only, not primary — they're unofficial and unreliable for spreads.

## Auth routes (built)
- `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/signup/check-email`, `/dashboard` (protected)
- `/auth/confirm` — route handler that verifies both signup-confirmation and password-reset links via `verifyOtp`
- `app/actions/auth.ts` — all auth server actions (signUp, signIn, signOut, requestPasswordReset, updatePassword)
- `middleware.ts` + `lib/supabase/middleware.ts` — required session refresh, do not remove

**Required manual Supabase Dashboard config (not doable via migration):**
- Authentication → Email Templates → "Confirm signup": change link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
- Authentication → Email Templates → "Reset Password": change link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
- Authentication → URL Configuration → Site URL: set to the real deployed URL (not localhost) once live
- Authentication → URL Configuration → Redirect URLs: add `http://localhost:3000/**` and the production URL `/**`

## Email
- `lib/email.ts` — `sendEmail()` wraps Resend's API via plain `fetch`, no SDK dependency. It never throws — missing env vars or a failed send just log and continue, so email can never break the action it's attached to.
- Required env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAIL` (admin notifications are skipped if unset).
- Triggers: account signup → admin notification. Survivor entry created → user welcome/instructions email + admin notification. Pick saved/changed → user confirmation email.
- Resend requires domain verification (SPF/DKIM) before sending to arbitrary recipients — see Section 3 of the roadmap doc.

## Branches
- `main` = production (Vercel production deploy + Supabase production).
- `dev` = staging (Vercel preview + Supabase dev branch).
- Feature branches → PR into `dev` → PR into `main`. Don't commit straight to `main`.

## Supabase project
- Project ref: `jdjhfyjxtlncuuqonvxm` (region: us-east-1)


## Production environment (critical — learned the hard way)

- `NEXT_PUBLIC_SITE_URL` **must** be set in Vercel (Production) to
  `https://cfbpools.com`. Used in `app/actions/auth.ts` for
  `emailRedirectTo`. If unset, it silently becomes the string "undefined"
  and signup/password-reset emails fail with a 500. `NEXT_PUBLIC_*` vars
  are baked in at build time — changing one requires a new deployment,
  not a restart.
- Supabase Dashboard → Authentication → URL Configuration:
  - Site URL must be `https://cfbpools.com` (not the `localhost:3000` default)
  - Redirect URLs allow-list must include `https://cfbpools.com/**`
    (plus `http://localhost:3000/**` for local dev)
- Supabase Dashboard → Authentication → SMTP Settings (Custom SMTP is
  enabled — do not disable it, or auth emails fall back to Supabase's
  rate-limited default mailer):
  - Host: `smtp.resend.com` (watch for stray characters here — a typo
    once caused a silent DNS lookup failure with no error in Resend's logs)
  - Port: 465, Username: `resend` (literal), Password: Resend API key
  - Sender: `noreply@mail.cfbpools.com` — must match Resend's verified
    domain exactly. Resend verified domain is `mail.cfbpools.com`, NOT
    the root `cfbpools.com` (root shows "Not Started" in Resend and
    cannot send).
- `RESEND_FROM_EMAIL` env var should match the SMTP sender above.

## Domain / DNS

- `cfbpools.com` is on Squarespace DNS. Previously pointed to a Bubble.io
  app (old product) via A records at `@` and `www` → `104.19.x.x`. Now
  points to Vercel: A record `@` → Vercel's apex IP, CNAME `www` →
  Vercel's CNAME target.
- Google Workspace MX/TXT/DKIM records and unrelated SendGrid CNAME
  records also live in this DNS zone (leftover from prior tools) —
  don't touch those when managing site or Resend records.

## GitHub branch protection (important — will block naive pushes)

- `main` has a repository rule requiring changes via pull request.
  A direct `git push origin main` is **rejected** (GH013 violation),
  even for trivial changes like triggering a redeploy after an env
  var update.
- Correct flow: push to `dev` (or a feature branch) → Vercel
  auto-builds a preview deployment → verify there → open a PR into
  `main` → merge → Vercel auto-deploys production. When opening a PR
  via `github.com/.../pull/new/<branch>`, GitHub sometimes defaults
  the base to the wrong branch — always confirm "base: main" before
  creating it.

## Admin portal schema (added for Phase 3)

- `survivor_entries.dues_paid` (boolean), `dues_paid_at` (timestamptz)
  — already existed prior to Phase 3, not newly added.
- `app_settings` — singleton row (`id boolean primary key default true`).
  Columns: `current_season`, `current_week_id`, `season_phase`,
  `survivor_signups_open`, `pickem_signups_open`, `updated_at`,
  `updated_by`. RLS: public read, admin-only update via `is_admin()`.
  Trigger `trg_app_settings_meta` auto-sets `updated_at`/`updated_by`
  on update — never set those manually in app code.
- `sync_logs` — tracks CFBD sync runs (cron + manual). Columns: `id`,
  `source` (default `'cfbd'`), `started_at`, `completed_at`, `status`
  (`running`/`success`/`error`), `games_updated`, `error_message`,
  `triggered_by` (nullable uuid — null means cron-triggered, set means
  a specific admin manually triggered it). RLS: admin-only
  select/insert/update. Not yet wired into
  `supabase/functions/cfbd-sync/index.ts` as of this note — that's
  Task 1 of the admin portal build.

