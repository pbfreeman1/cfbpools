# CFBPools.com — Project Context

Two pools, one site. See full requirements in `/docs` (add the original requirements doc here) and the roadmap doc for phased build order.

## Pools
- **SEC Survivor Pool** (build first): pick 1 SEC team/week to win. Lose = eliminated. 16 SEC teams, 14 weeks, so each entry must use a "bonus pick" in exactly 2 weeks of their choosing — bonus weeks require BOTH picked teams to win, or the entry is eliminated. Max 2 entries per user. Entry deadline Sept 5, 12pm.
  - **A pick is valid against any FBS opponent, any conference — it's only invalid if the opponent is FCS.** (Corrected here after an earlier session documented this backwards as "opponent must also be SEC.") `master_teams` rows backfilled by the CFBD sync for FCS opponents (see `supabase/functions/cfbd-sync/index.ts`, step "3a.") are tagged `conference: "FCS"` as a literal sentinel, not a real conference name — the eligibility check is `opponent.conference === "FCS"`, derived at query time, not stored as a flag (same pattern as kickoff-lock). Enforced in four places that must stay in sync: the pick UI (`app/survivor/[entryId]/page.tsx` computes it, `PickTool.tsx` renders it; `.../bonus/page.tsx` + `BonusPickTool.tsx` for bonus weeks), greyed out with a compact "🔒 FCS" badge — full explanation in a title attribute and a once-per-page legend, not repeated per card), the public `/survivor/schedule` page (same badge), and server-side in `savePick()` (`app/actions/survivor.ts`), which rejects the upsert outright — the UI only disables the button, so the server check is the real enforcement.
    - Known fragility: overloading `master_teams.conference` as a classification marker for the FCS sentinel (rather than a dedicated `classification` column) means a real conference literally named "FCS" would collide — not a real risk today, but worth a proper `classification` column if this area gets touched again.
  - **An eliminated entry can never submit or change a pick**, enforced in `validate_survivor_pick()` (the `BEFORE INSERT OR UPDATE` trigger on `survivor_picks`) — it looks up the entry's `status` first and raises before any other check runs. This was deliberately put in the trigger rather than tightened RLS, to stay consistent with how kickoff-lock and team-reuse are already enforced there (one place, both insert and update covered). The pick UI (`PickTool.tsx`, `BonusPickTool.tsx`) mirrors this by rendering every week as locked/read-only for an eliminated entry, but that's cosmetic — the trigger is the real enforcement, same division of labor as the FCS check above.
  - **Every matchup display in the app derives home/away the same way**, via `getMatchupPrefix(teamId, homeTeamId)` in `app/components/MatchupLine.tsx` — `"vs"` if `teamId === homeTeamId`, `"@"` otherwise (there's no neutral-site flag on `games`, so a neutral-site game just reads as `"vs"`). Two components share that logic: `OpponentLine` (a single team's opponent this week, from that team's own perspective — used in `PickTool.tsx` and `BonusPickTool.tsx`'s team-option cards, where the prefix + opponent logo always appear in that order, never logo-then-text) and `GameMatchupLine` (a full game shown from neither side, rendered as `"[away] @ [home]"` — used on `/survivor/schedule`, the homepage `MatchupStrip`, and referenced via the bare `getMatchupPrefix` helper on the admin results page, which keeps its own radio-button-per-team layout but labels each row with the same vs/@ logic). `survivor_picks_locked` (backing `/survivor/locked`) and the admin bonus-usage page intentionally don't use this — neither query pulls opponent/game data, they only show the picked team(s), so there's no matchup to label.
- **Weekly Pick'em Pool** (build second, spec still evolving): pick 6 games against the spread each week. 6-0 wins the pot; pushes count as losses; unlimited entries per user; picks lock 12pm Saturday.
- **The Survivor pick page (`/survivor/[entryId]`) is a single-week view, not a stacked list.** `page.tsx` (server) fetches every week's data up front and hands it to `PickTool.tsx` (client), which holds the selected week in `useState` and renders only that week. Switching weeks via the horizontal week-selector strip is pure client state — the URL's `?week=` is kept in sync with `window.history.replaceState`, deliberately *not* the Next.js router, so it never triggers a server round-trip. `?week=N` is still the real deep-link contract: the home entry grid's per-week links and `savePick()`'s redirects (`app/actions/survivor.ts`) all read/write it, so a fresh load or a save-and-reload lands back on the same week. If this page changes again, keep switching weeks client-only — routing through `router.push`/`replace` here would re-run the server component on every strip click.
  - **The horizontal week-selector strip is a shared component**, `WeekSelectorStrip` (`app/components/WeekSelectorStrip.tsx`) — a plain (non-`"use client"`) component so it can render from both server and client parents. Two modes, chosen per-item via an optional `href`: stateful select (button + `onSelect`, used by `PickTool.tsx` and `BonusPickTool.tsx` to swap client-side week state) or anchor link (used by `/survivor/schedule` to jump-scroll to a week's section rather than swap state). Reuse this for any future week-by-week navigation instead of hand-rolling another strip.
  - **The Bonus Pick Tool (`/survivor/[entryId]/bonus`) mirrors the main Pick Tool's shape** — `BonusPickTool.tsx` (client) is a single-week view driven by the same `WeekSelectorStrip` + `?week=`/`history.replaceState` pattern as `PickTool.tsx`, fed by `bonus/page.tsx` (server) which now computes data for *every* season week (not just open candidate weeks) so the strip can show all of them. It's a deliberately separate tool from the main Pick Tool, not a merged mode — bonus weeks need a two-team form (`BonusForm`, single-column like the main tool's cards, not the old multi-column grid) plus a `canOfferBonus` flag per week (unlocked, and either already a bonus week or the entry still has a bonus slot left) that main pick weeks don't need.
  - **Season-long team reuse is greyed out with a reason in both pick tools**, surfacing the same rule `validate_survivor_pick()` enforces server-side (no team may be picked twice all season, as a primary or bonus pick). Both `app/survivor/[entryId]/page.tsx` and `app/survivor/[entryId]/bonus/page.tsx` independently build a `usedWeekByTeamId` map from every one of the entry's picks (excluding the current week's own pick, so a week's own selection never shows as "already used against itself") and pass a `disabledReason` like `"Already picked — Week 3"` down to the team option — same pattern, same wording, in both tools, so the disabled state never comes as a surprise at submit time.
  - **`createEntry()` (`app/actions/survivor.ts`) signals a fresh entry via redirect query params**, not a flash message: `redirect('/survivor?entry_created=1&entry_name=...')`. `/survivor` renders `EntryCreatedModal` (`app/survivor/EntryCreatedModal.tsx`, `"use client"`, wrapped in `<Suspense>` since it calls `useSearchParams`) which fires a fade+scale CSS transition (no animation library — Tailwind transition/opacity/scale utilities only) on mount when it sees `entry_created=1`, then on dismiss clears both params via `router.replace` so a refresh never re-shows it. If another flow needs a similar "just did X" popup, follow this same query-param + client-modal-with-Suspense shape rather than adding new state.
  - **The homepage Survivor card CTA label is computed server-side in `app/page.tsx`** from the logged-in user's entry count (0 → "Enter the Survivor Pool", 1 → "Add a Second Entry", 2 → "Make This Week's Picks") — the `href` always stays `/survivor` since that page already owns the real state logic (`canCreateAnother`, zero-entry messaging); the homepage only adjusts the label so a maxed-out user is never told to "Enter" again. Don't duplicate `/survivor`'s entry-state logic elsewhere for this — just fetch the count and branch on it.
  - **The dashboard's "pick needed" banner (`app/dashboard/page.tsx`) reuses the same JSX/logic shape as `/survivor`'s** (`app/survivor/page.tsx`): a week counts as locked once every SEC game that week has kicked off, and any active entry with no pick for the current week and an unlocked week shows up with a "Pick now for X" link. The dashboard computes this only for the current week (not the full season grid `/survivor` builds), so don't copy `/survivor`'s full grid-building code here — just the current-week subset.

## Session workflow — always do this before finishing

Every session must end with work committed and pushed to GitHub, not left
sitting locally. Before ending a session:

1. Run `npx tsc --noEmit` and `npm run build` — confirm both pass clean.
2. `git add -A` and `git status` — review what's staged before committing.
3. Commit with a clear, descriptive message.
4. Push to a branch:
   - If working directly on `dev` and it's still in sync with `origin/dev`
     (check `git status` says "up to date"), push straight to `dev`.
   - If `dev` has diverged, or the change is large/risky enough to want a
     review step, push to a new feature branch instead
     (`git push -u origin <branch-name>`) rather than committing on `dev`.
5. State explicitly in the session summary: what branch the work landed on,
   whether it's pushed, and whether it's merged into `dev` — don't assume
   this is implied by "done."

Never end a session with uncommitted or unpushed changes without saying so
clearly in the summary.

## Conventions
- Supabase Auth (`auth.users`) + a `profiles` table for app fields — never a custom users table.
- **Email + password auth only** — no magic link, no OAuth/social sign-in (Google, Apple, etc.). Require email confirmation on signup. Build a proper self-service password reset flow (Supabase Auth's `resetPasswordForEmail`) since there's no magic-link fallback — this depends on transactional email working reliably, so don't defer email setup too late.
- Shared `GAMES` table for both pools; `MASTER_TEAMS` is the single source of truth for team data.
- Picks: one current-state table per pool, with a Postgres trigger writing to a `_log` history table on every insert/update. Don't hand-write log-table application logic.
- Lock state is derived from `now() > game.kickoff_time`, not stored as a manually-toggled flag (or flipped by a scheduled Edge Function at kickoff).
- RLS policies are mandatory on every user-data table — write them alongside the schema, not after.
- Primary data source: CFBD API (collegefootballdata.com) for schedules/results/spreads. ESPN's public endpoints are a live-score fallback only, not primary — they're unofficial and unreliable for spreads.
- **A horizontally-scrolling week-by-week grid with a fixed leading column (entry name/status, team name, etc.) must be built as a flex/CSS-Grid layout, never an HTML `<table>` with `position: sticky` on `<td>`/`<th>`.** Sticky table cells are unreliable during horizontal scroll on mobile Safari specifically — cells can render over or under the "fixed" column mid-scroll. The pattern (see the "Your entries" table on `/survivor`, `app/survivor/page.tsx`): a flex row with the label column as a genuinely separate flex-shrink-0 sibling *outside* the scrolling container, and a second `overflow-x-auto` sibling holding a CSS Grid (`gridTemplateColumns: repeat(N, <px>)`) for the scrollable cells — matching row heights and gap between the two so they stay visually aligned. No `position: sticky` involved, so the fixed column structurally cannot drift.
- **The SEC schedule page (`/survivor/schedule`) reuses `WeekSelectorStrip`** (see above) in anchor-link mode to jump to a week's section, and — when logged in with at least one Survivor entry — overlays that entry's picks directly on the schedule (`?entry=` selects which of a user's up-to-2 entries; defaults to the first). The overlay doesn't touch `GameMatchupLine`'s contract (relied on by 4+ places per the FCS-eligibility note above); it's a separate highlight/badge rendered alongside each game row instead.

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
- `lib/email.ts` — `sendEmail()` wraps Resend's API via plain `fetch`, no SDK dependency. It never throws — missing env vars or a failed send just log and continue, so email can never break the action it's attached to. `sendEmailWithResult()` is the same delivery but reports success/failure, used only by the admin test-email tool.
- Three sending streams, one Resend-verified subdomain each, selected per call via the required `stream: EmailStream` param (`"picks" | "welcome" | "updates"`):
  - `picks` (`RESEND_FROM_PICKS`, `mail.cfbpools.com`) — pick confirmations **and** admin notifications (new account, new entry).
  - `welcome` (`RESEND_FROM_WELCOME`) — entry welcome/confirmation emails.
  - `updates` (`RESEND_FROM_UPDATES`, `updates.cfbpools.com`) — weekly recap / bulk announcements (not built yet).
- Required env vars: `RESEND_API_KEY`, `RESEND_FROM_PICKS`, `RESEND_FROM_WELCOME`, `RESEND_FROM_UPDATES`, `ADMIN_EMAIL` (admin notifications are skipped if unset). There is no single shared `RESEND_FROM_EMAIL` anymore.
- Triggers: account signup → admin notification (subject includes running registered-user count). Survivor entry created → user welcome/instructions email + admin notification (subject includes running entry count). Pick saved/changed → user confirmation email.
- Resend requires domain verification (SPF/DKIM) before sending to arbitrary recipients — see Section 3 of the roadmap doc. `cfbpools.com` root, `mail.cfbpools.com`, and `updates.cfbpools.com` are all verified with DMARC (`p=none`) published.

## Branches
- `main` = production (Vercel production deploy + Supabase production).
- `dev` = staging (Vercel preview + Supabase dev branch).
- Feature branches → PR into `dev` → PR into `main`. Don't commit straight to `main`.

## Supabase project
- Live project ref: `jdjhfyjxtlncuuqonvxm` (region: us-east-1).
- Dev branch project ref: `gwufnaosvoqxndxcstkn` — a Supabase branch off the
  live project (created via `create_branch`, all migrations applied as of
  creation). Created with `with_data: false`, so it mirrors schema/structure
  only, not live rows — seed it directly if a task needs realistic data
  rather than querying prod data into it.
- **Branch-first migration workflow**: any schema change, RLS policy change,
  or new migration goes to the dev branch (`gwufnaosvoqxndxcstkn`) first via
  `apply_migration`/`execute_sql`, and gets verified working there. Only
  then apply the same migration to the live project (`jdjhfyjxtlncuuqonvxm`)
  as a second, separate step — "it worked on the branch" is not a reason to
  skip the live-project step, and vice versa: never apply schema changes to
  live without having proven them on the branch first.


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
- This SMTP sender is independent from the app's own Resend HTTP-API sends
  in `lib/email.ts` (see Email section) — Supabase Auth handles
  signup-confirmation/password-reset itself via this SMTP relay, while
  `lib/email.ts` calls Resend's API directly with one of the three
  `RESEND_FROM_*` addresses depending on the email's stream. There's no
  single var these must match anymore.

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
- `profiles.payment_method` (text, `CHECK IN ('venmo', 'paypal', 'other')`)
  and `profiles.payment_handle` (text, nullable) — one preferred payment
  method per user, editable from `/dashboard` via `updatePaymentInfo()`
  (`app/actions/profile.ts`). Follows the same text+CHECK convention as
  `survivor_entries.status` / `app_settings.season_phase` rather than a
  Postgres enum type.
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
  select/insert/update. Wired into `supabase/functions/cfbd-sync/index.ts`
  (writes a `running` row on start, updates to `success`/`error` on
  completion; log writes are isolated in their own try/catch so a
  logging failure can never crash the sync).
- `admin_actions` — generic audit trail for admin-initiated writes that
  aren't already covered by a table-specific `_log` trigger (e.g.
  `survivor_entries.status` changes from the elimination workflow, which
  `survivor_picks_log` doesn't touch). Columns: `id`, `admin_id`,
  `action` (text, e.g. `'eliminate_entry'` / `'reinstate_entry'`),
  `target_table` (text), `target_id` (uuid), `previous_value` (jsonb),
  `new_value` (jsonb), `note` (text), `created_at`. RLS: admin-only
  select/insert. Reuse this pattern for other admin overrides (manual
  entry edits, etc.) rather than adding new one-off log tables.
- `profiles_update_admin` RLS policy (`is_admin()`, both `USING` and
  `WITH CHECK`) — lets admins update other users' `profiles` rows (e.g.
  toggling `is_admin` from the Users page). `profiles_update_own` still
  governs self-updates and independently guards against a user
  escalating their own `is_admin` flag.
- `survivor_entries_update_own` RLS policy was simplified to a plain
  ownership check (`user_id = auth.uid()` for both `USING` and
  `WITH CHECK`) — it previously had a self-referential subquery bug.
  Protection against users changing their own `status` or
  `eliminated_week_number` is now enforced by a `BEFORE UPDATE` trigger,
  `trg_protect_survivor_entries_status` →
  `protect_survivor_entries_status()`: compares `OLD` vs `NEW` and raises
  an exception on a `status`/`eliminated_week_number` change unless
  `is_admin()` is true. Triggers fire even for service-role connections
  (RLS bypass doesn't skip triggers), and `is_admin()` reads
  `auth.uid()` — which is null for a service-role client — so status
  changes must be written via the logged-in admin's cookie-based
  session (the normal `createClient()` server pattern), not a
  service-role client, or the trigger raises.

