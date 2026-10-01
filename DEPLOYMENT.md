# Deployment Guide — SAO Document Tracking System

Target architecture:

| Component | Platform | Notes |
|---|---|---|
| `apps/web` (Next.js 16) | **Vercel** | Native Next.js hosting, auto-deploys from GitHub |
| `apps/api` (NestJS + Socket.IO) | **Hostinger Node.js Web App** | Business plan supports Node apps + GitHub auto-deploy |
| PostgreSQL | **Neon** (already hosted) | Same database — no change |

Important caveats (be aware before going live):

- **Hostinger Node apps sleep when idle.** Hostinger stops the process after a period without traffic and restarts it on the next request — expect cold starts (~seconds) and dropped socket connections after idle, similar to free-tier PaaS. Socket.IO auto-reconnects, so the app recovers on its own.
- **WebSocket upgrade may not pass through Hostinger's shared-hosting proxy.** Socket.IO automatically falls back to long-polling, so realtime features still work — just with slightly higher latency. Test after deploy (Step 5).
- The API runs as a single instance with no Redis adapter — correct for this setup.

---

## Already done in code (deploy-prep commit)

- `apps/web/next.config.ts` — when `API_PROXY_ORIGIN` is set, Next.js rewrites proxy `/api/*` and `/socket.io/*` to the API. The web app calls the API same-origin, so the session cookie is first-party — required because Safari (ITP) blocks cross-site cookies even with `SameSite=None`, which bounced Safari/iPad users back to the login page.
- `apps/api/src/auth/auth.controller.ts` — session cookie uses `SameSite=Lax` in production (requests are same-site through the proxy; `None` is no longer needed and Safari would block it anyway). `Secure` stays on in production.
- `apps/api/src/main.ts` — listens on `PORT` (injected by the host) with `API_PORT` fallback for local dev.
- `package.json` — the root `build` script runs `deploy:api`, which generates the Prisma client, builds `@sao/contracts`, `@sao/db`, and `@sao/api` in dependency order via `npm -w`, then copies `apps/api/dist` **and** `node_modules` into a self-contained root `dist/` — Hostinger ships only the output directory to the runtime, so `node_modules` must be inside it. Hostinger locks npm deploys to `npm run build`, so this is exactly what its build runs. Use `pnpm build:all` locally to build every package including the web app.

---

## Step 1 — Database (terminal, already using your existing Neon DB)

No new database needed. Run migrations + seed from your local machine against the same Neon database:

```powershell
npx --yes pnpm@10.17.1 db:deploy
npx --yes pnpm@10.17.1 db:seed
```

If you've been developing against this Neon DB already, `db:deploy` will report nothing to do — fine. `db:seed` upserts (safe to re-run; won't overwrite an existing admin credential). Requires `DATABASE_URL` and `ADMIN_PASSWORD` (12+ chars) in local `.env`.

---

## Step 2 — API on Hostinger (hPanel, ~10 min, one-time)

1. hPanel → **Websites** → your site → **Add Website → Node.js web app** (called "Web Apps" in hPanel) → **Import Git repository** → connect GitHub → pick this repo.
2. Deploy settings:

   | Setting | Value |
   |---|---|
   | Framework preset | NestJS (or `Other`) |
   | Branch | `main` (or your default branch) |
   | Node.js version | **22** |
   | Root directory | `/` — repo root, **not** `apps/api`. The API depends on workspace packages (`@sao/contracts`, `@sao/db`) that must also be built, so install + build must run at monorepo root |
   | Package manager | `npm` — **not** pnpm; Hostinger's pnpm/corepack install is broken |
   | Build command | `npm run build` (locked default — that's fine, root `build` runs `deploy:api`) |
   | Output directory | leave blank — only needed for static frontends |
   | Entry file | `apps/api/dist/main.js` |
   | Domain | assign a subdomain, e.g. `api.yourdomain.com` |

3. Environment variables (app settings in hPanel):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Your Neon pooled connection string — same DB as local (`...-pooler...neon.tech/...?sslmode=require`) |
   | `WEB_ORIGIN` | Your Vercel URL, e.g. `https://sao-dts.vercel.app` — set after Step 3, then redeploy/restart the app |
   | `API_PORT` | Only if hPanel assigns a fixed port — the code also honors `PORT` automatically |

4. Deploy. Verify: `https://api.yourdomain.com/api/health/live` returns `{"status":"ok"}`.

Note: `main.ts` tries to load `../../.env` — harmless in production (file absent, `dotenv` no-ops, panel env vars apply).

---

## Step 3 — Web on Vercel (dashboard or terminal)

### Option A — Dashboard (easiest)

1. [vercel.com](https://vercel.com) → sign up with GitHub → **Add New → Project** → import the repo.
2. **Root Directory:** `apps/web` (click Edit). Vercel auto-detects Next.js + pnpm workspaces — leave build/install commands default.
3. Environment variable:

   | Key | Value |
   |---|---|
   | `API_PROXY_ORIGIN` | `https://api.yourdomain.com` — **no `/api` suffix** (the rewrites append it). This makes the web app call the API same-origin through Next.js rewrites, which is required for Safari/iPad login — Safari blocks cross-site session cookies entirely |

   **Do not set `NEXT_PUBLIC_API_URL`** — when it's absent the app calls `/api` and `/socket.io` on its own origin and the rewrites forward them to the API.

4. Deploy → you get `https://<project>.vercel.app`.

### Option B — Terminal (Vercel CLI)

```powershell
npx vercel login
cd apps/web
npx vercel link
npx vercel env add API_PROXY_ORIGIN production   # paste the Hostinger API URL (no /api suffix)
npx vercel --prod
```

---

## Step 4 — Cross-wire env vars

1. Copy your final Vercel URL → hPanel → the Node app's env vars → set `WEB_ORIGIN=https://<project>.vercel.app` → restart/redeploy the app.
   - `WEB_ORIGIN` feeds three things: HTTP CORS, Socket.IO CORS, and the CSRF origin check.
2. If the API domain ever changes, update `API_PROXY_ORIGIN` in Vercel and redeploy (it's baked into the rewrites at build time).

---

## Step 5 — Verify

- [ ] `https://api.yourdomain.com/api/health/live` → `{"status":"ok"}`
- [ ] Open the Vercel URL → log in as admin (`ADMIN_USERNAME`/`ADMIN_PASSWORD` from the seed)
- [ ] Cookie set: DevTools → Application → Cookies → `sao_session` on the **Vercel domain** (not the API domain) shows `SameSite=Lax`, `Secure`
- [ ] Log in from **Safari or an iPad** — must stay on the dashboard, not bounce back to login
- [ ] Open the app in two browsers → create/edit a document → realtime updates + grid presence work (proves Socket.IO — via WebSocket or polling fallback)
- [ ] No CORS or `Invalid request origin` errors in the browser console
- [ ] After ~15 min idle: first request is slow (cold start) then works — expected on Hostinger Node apps

---

## Terminal vs. GUI breakdown

| Task | Terminal | GUI |
|---|---|---|
| DB migrate + seed | Yes | — |
| Code prep + push | Yes | — |
| Hostinger app creation + env vars | — | hPanel |
| Vercel project + deploy | `npx vercel` CLI | or dashboard |
| Every future deploy | `git push` (auto-deploys both) | — |

~80% terminal. The only GUI work is the one-time Hostinger/Vercel setup and env var entry.

---

## Troubleshooting

- **Build fails on Hostinger at install:** confirm root directory is `/` (repo root) and package manager is `npm` — workspace deps can't resolve from `apps/api` alone. The API compiles directly with `tsc` because Hostinger omits dev-only `@nestjs/cli` when `NODE_ENV=production`.
- **App starts but health check fails:** check Hostinger app logs; confirm `DATABASE_URL` is set and the Neon compute isn't suspended (first query after idle is slow — retry).
- **Login works locally but not in prod (or bounces back to login on Safari/iPad):** the session cookie isn't reaching the API. Confirm `API_PROXY_ORIGIN` is set on Vercel **and** `NEXT_PUBLIC_API_URL` is removed — `NEXT_PUBLIC_API_URL` forces cross-site requests that Safari's ITP strips cookies from. Also confirm `WEB_ORIGIN` exactly matches the Vercel URL (no trailing slash).
- **`Invalid request origin` on POST/PUT:** the CSRF guard compares `Origin` to `WEB_ORIGIN` — same fix as above.
- **Realtime feels delayed:** Vercel rewrites can't proxy WebSocket upgrades (and Hostinger's proxy may not either), so Socket.IO runs on long-polling — functional, just less instant. Nothing to fix in code.

## Later improvements

- **Same-site domains:** if you ever point a subdomain of the *same* domain at Vercel (`app.yourdomain.com`) and Hostinger (`api.yourdomain.com`), you can drop `API_PROXY_ORIGIN` and set `NEXT_PUBLIC_API_URL=https://api.yourdomain.com` instead — requests become same-site so `SameSite=Lax` cookies still work everywhere including Safari.
- **Keep-alive:** a cron ping to `/api/health/live` every ~10 min (e.g. cron-job.org) reduces Hostinger cold starts.
