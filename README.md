# BUKLOD QuickCheck Web

Canonical standalone QuickCheck web app. This project removes the production dependency on AppDeploy.

## Architecture

- Frontend: React + Vite, deployable to Vercel or any static web host.
- Backend: BUKLOD Connect Supabase (`yhanxndaqbmuzbdqlblu`) Edge Functions.
- Permanent data: structured pages, canonical question sets, grades, approvals, batch history.
- Local-first source files: original PDF/DOCX/images are processed in the browser and are not permanently uploaded/stored.
- Assessment identity: canonical question-set unity (normalized questions/instructions/numbering), never title alone.
- Student identity: explicit name/ID is a hard boundary; different named students must never be merged merely because handwriting or page continuity looks similar.

## Active Edge Functions

- `quickcheck-process-v1` — analyze, rubric extraction, question-set reconciliation, grading.
- `quickcheck-records-v1` — batch persistence, history, grade edits, approvals/releases.
- `quickcheck-handoff-redeem-v2` — secure BUKLOD Classroom handoff/session.
- `buklod-auth-login-v2` — standalone BUKLOD login.

## Local setup

```bash
cp .env.example .env
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Deploy `dist/` to Vercel/Expo static hosting, or connect the repository to Vercel for automatic deployments on push.

## Required Supabase secret

The deployed `quickcheck-process-v1` function expects `GEMINI_API_KEY` in Supabase Edge Function secrets. The active BUKLOD Connect deployment already has the function deployed; do not place the secret in this repository.

## Deployment flow

1. Git push to `main`.
2. Vercel builds `npm run build`.
3. Static frontend calls Supabase Edge Functions directly.
4. Backend changes are deployed with Supabase CLI or MCP, independent of Vercel.

## Release safety

- Do not store source papers by default.
- Teacher edits reset approval to Pending.
- Released grades are locked from silent edits.
- Question-set identity is independent of titles/file names.
- Explicit student identity overrides handwriting/page-continuity guesses.
