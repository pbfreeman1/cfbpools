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

## Branches
- `main` = production (Vercel production deploy + Supabase production).
- `dev` = staging (Vercel preview + Supabase dev branch).
- Feature branches → PR into `dev` → PR into `main`. Don't commit straight to `main`.

## Supabase project
- Project ref: `jdjhfyjxtlncuuqonvxm` (region: us-east-1)
