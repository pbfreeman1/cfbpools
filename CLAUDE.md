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
- 

## Environment Variables — Critical

- `NEXT_PUBLIC_SITE_URL` must be set to `https://cfbpools.com` in Vercel (Production).
  Used in `app/actions/auth.ts` to build Supabase `emailRedirectTo` URLs. If missing,
  it resolves to the literal string "undefined" and breaks signup confirmation emails
  with a 500 error. `NEXT_PUBLIC_` vars are baked in at build time — changing this
  requires a new deployment, not just a restart.
- `RESEND_API_KEY` — used for app-level transactional emails via `lib/email.ts`.
- Supabase auth emails (signup confirmation, password reset) are routed through
  Resend via Custom SMTP, configured in Supabase Dashboard → Authentication →
  SMTP Settings (Host: smtp.resend.com, Port: 465, Username: resend, Password:
  Resend API key, Sender: noreply@mail.cfbpools.com). Watch for typos in the Host
  field — a stray trailing character there caused a silent DNS lookup failure.

## Supabase Auth Configuration

- Site URL (Authentication → URL Configuration) must be `https://cfbpools.com`,
  not the `localhost:3000` default.
- Redirect URLs allow-list must include `https://cfbpools.com/**` (and optionally
  `http://localhost:3000/**` for local dev) or auth redirects will fail to match
  and fall back unpredictably.

## GitHub Branch Protection

- `main` requires changes via pull request — direct pushes are rejected
  (GH013 rule violation), including from local `git push origin main`.
- Standard workflow: work on `dev` → push → Vercel auto-builds a preview deployment
  at that branch's preview URL → test there → open a PR from `dev` into `main` →
  merge → Vercel auto-deploys `main` to production (cfbpools.com).
- Even trivial changes (e.g. triggering a redeploy after an env var change) need
  to go through a branch + PR, not a direct push to `main`.

## Domain / DNS

- cfbpools.com DNS is managed in Squarespace. Previously pointed to Bubble
  (old app); now points to Vercel via an A record (@ → Vercel's IP) and CNAME
  (www → Vercel's CNAME target).
- Resend sends from the `mail.cfbpools.com` subdomain (verified separately from
  the root domain, which is not Resend-verified and shouldn't be used as a
  sender address).
- Google Workspace MX/TXT/DKIM records and SendGrid CNAME records also live in
  this DNS zone for existing email — don't touch those when managing site or
  Resend records.
