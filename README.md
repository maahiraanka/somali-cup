# Somali Cup v0.2 — Identity + City Selection + Qualification Engine

Standalone Somali Cup production application.

## Stack
- React + Vite
- Node.js + Express
- MySQL
- Hostinger Business-compatible single Node deployment
- GitHub-ready monorepo

## What v0.2 adds
- Supporter identity creation
- 30-day bearer device sessions
- City selection and one active city membership per season
- Verified membership state
- Public qualification standings
- City qualification detail pages
- Qualification progress against per-city targets
- Admin qualification controls (open/close city, target, state)
- Qualification event ledger + audit entry for admin changes
- Seed data for 12 launch cities

## Qualification invariant
Only `ACTIVE + VERIFIED` city memberships count toward public qualification standings. Raw clicks, page views, invites, and pending/rejected memberships never count.

## Production
- `npm install`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run build`
- `npm start`
- Express serves `/api/*` and the React build.

## API surface
- `GET /api/health`
- `GET /api/public/snapshot`
- `GET /api/qualification`
- `GET /api/qualification/cities/:code`
- `POST /api/identity/join`
- `GET /api/identity/me` (Bearer session)
- `POST /api/identity/logout` (Bearer session)
- `GET /api/admin/qualification` (`x-admin-key`)
- `PATCH /api/admin/qualification/cities/:cityId` (`x-admin-key`)

## Admin bootstrap note
`ADMIN_BOOTSTRAP_KEY` is a temporary v0.2 safety guard for qualification administration. It is **not** the final admin authentication model.

## Baseline
This repository is the official v0.2 baseline for Somali Cup. Hostinger staging should be deployed from this baseline before the v0.3 match engine begins.
