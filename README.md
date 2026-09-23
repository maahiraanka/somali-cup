# Somali Cup v0.3 — Match Engine

Standalone Somali Cup production application.

## Stack
- React + Vite
- Node.js + Express
- MySQL
- GitHub
- Vercel staging
- Hostinger Business for production

## Product baseline
v0.2 established supporter identity, city selection, qualification standings and admin qualification controls.

v0.3 adds the authoritative competition engine:
- Match fixtures
- Match lobby
- Verified match participation
- Personal match share tokens
- Same-city referral lineage
- One verified goal per participant
- One assist for the inviter when a referred same-city participant activates
- No double-counting of assists as extra score
- Idempotent match activation
- Authoritative scoring event ledger
- Cached home/away score with score version
- Live match snapshot + recent scoring activity
- Personal match contribution endpoint
- Admin fixture creation
- Controlled match state transitions
- Full-time winner lock
- Match state event history

## Match scoring invariant
**One verified participant can move their city's score exactly once per match.**

A referral creates attribution, not a second point:
- New verified participant activates = city +1 goal
- If they came through a same-city participant link = inviter +1 assist
- The assist does not add another city point

This is the core anti-inflation rule for Somali Cup.

## Match lifecycle
`SCHEDULED → LOBBY → LIVE → FINAL`

Admin may cancel before finalisation.

- LOBBY: players reserve their place and receive a personal share token.
- LIVE: registered players activate once and create their one authoritative goal.
- FINAL: score is frozen and the winner is stored.
- A tied match cannot be finalised yet; later versions will add tie-break rules.

## Key match API
- `GET /api/matches`
- `GET /api/matches/:publicId`
- `GET /api/matches/:publicId/live`
- `GET /api/matches/:publicId/me`
- `POST /api/matches/:publicId/join`
- `POST /api/matches/:publicId/activate`

Admin bootstrap routes:
- `GET /api/admin/matches`
- `POST /api/admin/matches`
- `PATCH /api/admin/matches/:publicId/state`

## Database
Run:
- `npm run db:migrate`
- `npm run db:seed`

Migration `003_match_engine.sql` adds match state, activation state, assists and state-event history.

## Verification
Run:
- `npm run build`
- `npm run verify`

The verification script checks v0.2 and v0.3 schema requirements.

## Staging
GitHub `main` is the active Vercel staging branch.
`baseline/v0.2` remains the rollback checkpoint before the match engine.

## Temporary admin security
`ADMIN_BOOTSTRAP_KEY` remains a temporary development/staging guard. Role-based admin authentication must replace it before production.
