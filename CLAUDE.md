# CLAUDE.md

Project conventions and operational notes. Keep this file short — it's loaded into every Claude session.

## Project

Consentinel — agent-first permission kernel for Platanus Hack 2026. Next.js 14 frontend in `app/`, TypeScript kernel library in `src/`, Foundry contracts under `contracts/`. Single repo, no monorepo split.

## Git remotes (dual-remote setup)

`origin` is configured with **one fetch URL** and **two push URLs**:

- fetch: `git@github.com:platanus-hack/platanus-hack-26-ar-team-15.git` (team repo)
- push (1): same team repo
- push (2): `git@github.com:Gastonfoncea/consentinel.git` (personal mirror — Vercel watches this one)

Verify with `git remote -v`. Do not "fix" the second push URL — it is intentional.

### Workflow rules

- **Pulls** always come from the team repo (the fetch URL). Run `git pull origin <branch>` as normal.
- **Pushes** automatically reach both repos in one command. `git push origin <branch>` updates the team repo *and* triggers the Vercel deploy on the personal mirror.
- **Pull requests** are opened against the team repo (`platanus-hack/...`). The personal mirror does not receive PRs.
- **Auto-deploy**: every push to `main` on the personal mirror triggers a Vercel build. Avoid pushing broken code to `main` even temporarily.

## Tooling

- Package manager: **npm**. Do not introduce `pnpm-lock.yaml` (it would bifurcate the lockfile). The repo's `package-lock.json` is authoritative.
- Node TypeScript compiles via two configs: root `tsconfig.json` (Next.js) and `tsconfig.kernel.json` (kernel build). The build script for the kernel is `npm run build:kernel`.
- Test runner: `node --test` via `tsx`. Run with `npm test`.

## Branching

- Branch names come from Linear's `gitBranchName` field (e.g. `gastonfoncea09/pla-N-...`). Use them verbatim so Linear auto-links the PR.
- Branch off `main` directly. Do not stack PRs on each other — earlier in the project a PR was stacked on an unmerged branch and the merge to `main` lost commits, requiring a rescue PR.

## Linear

- Workspace: `platanushack`. Single team, also called `PlatanusHack`. There is no "In Review" status — workflow is `Backlog → Todo → In Progress → Done`.
- Move issues to `In Progress` when the branch is created and to `Done` after the PR merges to `main`.

## Auth (WebAuthn)

- `RP_ID` and `RP_ORIGIN` are env-driven. In dev, `lib/auth/config.ts` accepts any `localhost:<port>` origin so the server still works when Next falls back from `:3000` to `:3001`.
- The user/credential store is an in-memory Map pinned to `globalThis` (see `lib/auth/store.ts`). It survives Next.js HMR and per-route module isolation in dev. It does **not** survive a Vercel cold start — a serverless deploy will lose state across instances. Migrate to Vercel KV or similar before relying on persistence in production.
- `SESSION_PASSWORD` must be 32+ chars. The default in `lib/auth/config.ts` is for dev only.

## Environment variables

- Local: `.env.local` (gitignored, already populated with a generated `SESSION_PASSWORD`). Templates: `.env.example` (wallet) and `.env.local.example` (auth).
- Vercel: env vars are configured in the Vercel project Settings, not via `.env.local`.
