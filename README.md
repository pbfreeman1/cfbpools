# cfbpools

SEC Survivor Pool + Weekly College Football Pick'em, built on Next.js 15, Supabase, and Vercel.

## What's already set up for you

- **Supabase project** `cfbpools` is live at `https://jdjhfyjxtlncuuqonvxm.supabase.co` (region: us-east-1). Credentials are pre-filled in `.env.local`.
- **Next.js 15 + TypeScript + Tailwind** scaffold with the App Router.
- Supabase browser + server client helpers in `lib/supabase/`.
- A GitHub Actions CI workflow that lints, typechecks, and builds on every push/PR to `dev` and `main`.

## 1. Push this to GitHub

```bash
cd cfbpools
git init
git add .
git commit -m "Initial scaffold: Next.js 15 + TS + Supabase"
git branch -M main
git remote add origin https://github.com/<your-username>/cfbpools.git
git push -u origin main
git checkout -b dev
git push -u origin dev
```

(Create the empty `cfbpools` repo on GitHub first — no README/gitignore, since this scaffold already has them.)

## 2. Connect Vercel

In the [Vercel dashboard](https://vercel.com/new), import the `cfbpools` GitHub repo. Vercel auto-detects Next.js. Set the **Production Branch** to `main` — every other branch (including `dev`) automatically gets Preview Deployments, which is your dev/test environment.

Add the same environment variables from `.env.local` in the Vercel project settings (Production + Preview).

## 3. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — you should see the placeholder homepage confirming the scaffold works.

## 4. Set the branch protection / default branch

On GitHub, set `dev` as the default branch for day-to-day PRs, and protect `main` so it only receives merges from `dev`. This matches the local → dev → main flow from the requirements doc.

## Next steps

See `CLAUDE.md` for project conventions, and the roadmap doc for the full phased build plan. Phase 0 (this scaffold) is done — Phase 1 is the `MASTER_TEAMS` / `GAMES` schema and the CFBD API sync job.
