# SAO Document Tracking System

## Scope

This repository tracks metadata and physical-document movement. Do not add file upload or document storage without an approved scope change.

`process2.md` is the authoritative source for the initial 37-step workflow. Do not guess unresolved MCC, COA, return-routing, formula, or validation rules; keep them pending stakeholder confirmation.

## Architecture

- `apps/web`: Next.js App Router frontend
- `apps/api`: NestJS REST API and Socket.IO gateway
- `packages/contracts`: shared validation, permission, and event contracts
- `packages/db`: Prisma schema and PostgreSQL client
- `infra`: deployment and reverse-proxy configuration

## Local Setup

1. Copy `.env.example` to `.env` and replace development secrets. Never place credentials in `.env.example`.
2. Set `DATABASE_URL` to Neon PostgreSQL or start local PostgreSQL with `docker compose up -d postgres`.
3. Install dependencies with `pnpm install`.
4. Generate Prisma Client with `pnpm db:generate`.
5. Deploy migrations with `pnpm db:deploy` and seed with `pnpm db:seed`.
6. Start applications with `pnpm dev`.

If pnpm cannot be enabled globally on Windows, replace `pnpm` with `npx --yes pnpm@10.17.1`.

## Frontend conventions

- Icons come from `@phosphor-icons/react` (Phosphor Icons). Use it for any new icons in `apps/web`.

## Verification

Run these before considering a change complete:

- `pnpm db:validate`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Security

Passwords must be irreversibly hashed and must never be displayed, logged, or recoverable. Admin account access uses reason-required audited impersonation and secure password reset. Enforce permissions in the API; UI visibility is not authorization. Realtime subscriptions must authenticate and authorize room access.
