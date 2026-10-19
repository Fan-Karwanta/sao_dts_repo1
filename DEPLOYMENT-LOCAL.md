# LAN Deployment Guide — SAO Document Tracking System

Everything runs on a Windows machine inside the institution network. Users open
a URL like `http://192.168.2.5/sao_dts` (same style as iHRIS's
`/dogh_ihris`); remote staff connect through the office VPN.
No Vercel, no Hostinger, no external rate limits.

```
browser ──► Apache/XAMPP :80 ──► /sao_dts/* ──► Next.js web :3000
                │                /sao_dts/api + /sao_dts/socket.io ──► NestJS API :3001 ──► PostgreSQL :5432
                └──► /dogh_ihris (iHRIS, untouched)
```

**If the server is dedicated to this app** (no existing Apache), use nginx on
port 80 instead and serve the app at the root — see "Alternative: dedicated
server" at the bottom.

## For the human: how to trigger this on the server

1. Clone this repo onto the server (or let Devin do it):
   `git clone https://github.com/Fan-Karwanta/sao_dts_repo1.git C:\sao-dts`
   (Do **not** put it in `htdocs` — Apache can't run Node.js; it only proxies to it.)
2. Install Devin Desktop on the server, open this folder, and paste:

   > This is the local Windows server for the SAO document tracking system.
   > It already runs XAMPP/Apache on port 80 serving iHRIS at /dogh_ihris —
   > do not touch that. Read DEPLOYMENT-LOCAL.md and execute it: run
   > scripts/setup-local-server.ps1 in an elevated PowerShell, then configure
   > Apache per the "Apache proxy" section (infra/apache/sao-dts.conf), run
   > scripts/register-autostart.ps1, and complete the verification checklist.
   > Ask me for any values you need. Do not stop until
   > http://localhost/sao_dts/ loads the login page and a login succeeds.

3. Have these answers ready — the script will ask for them:
   - **Server address**: `http://192.168.2.5` (just the host — the `/sao_dts`
     path is handled by the build, not WEB_ORIGIN). Add `http://localhost` too
     if you'll test on the server itself: `http://192.168.2.5,http://localhost`
   - **DB password** for the new `sao` Postgres user (letters/numbers only)
   - **Admin password** for the app's admin account (12+ chars)
   - **Neon DATABASE_URL** to import all existing cloud data (recommended)

## What setup-local-server.ps1 does

Run from an **elevated** PowerShell. Idempotent — re-running is safe.

1. Detects XAMPP/Apache (`C:\xampp\apache\bin\httpd.exe`):
   - **Apache found** → proxy mode: installs `infra/apache/sao-dts.conf`,
     enables the proxy modules in `httpd.conf`, skips nginx entirely.
   - **No Apache** → dedicated-server mode: installs + configures nginx.
2. Installs git, Node.js 22 LTS, pnpm, PM2, PostgreSQL 18 (required — Neon
   runs PG18 and `pg_dump` refuses to export from a newer server).
3. Clones/updates the repo to `C:\sao-dts`, writes `C:\sao-dts\.env`
   (`COOKIE_SECURE=false` is essential — over plain HTTP, Secure cookies are
   never stored and login would silently fail).
4. **Apache mode only:** writes `apps\web\.env` with the sub-path config
   (see below), then creates the `sao` DB user + `sao_dts` database,
   migrates + seeds, and builds.
5. Applies Apache config / starts nginx, starts the apps under PM2, registers
   everything to start on boot (`register-autostart.ps1`), opens the
   firewall, and offers the Neon data import.

**Sub-path config (`apps\web\.env`, Apache mode only):**

```ini
NEXT_BASE_PATH=/sao_dts
NEXT_PUBLIC_API_URL=/sao_dts
```

This file is gitignored and machine-specific. It must exist for **both**
`next build` and `next start` — `next.config.ts` is re-evaluated when the
server starts, so a basePath set only at build time produces a server whose
manifest expects `/sao_dts` but which 404s every `/sao_dts/*` request.
`NEXT_PUBLIC_API_URL=/sao_dts` makes the browser call `/sao_dts/api/...` and
`/sao_dts/socket.io/...` — same-origin through Apache.

## Apache proxy (shared server — iHRIS stays untouched)

1. In `C:\xampp\apache\conf\httpd.conf`, make sure these LoadModule lines are
   uncommented:

   ```
   LoadModule proxy_module modules/mod_proxy.so
   LoadModule proxy_http_module modules/mod_proxy_http.so
   LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so
   LoadModule rewrite_module modules/mod_rewrite.so
   ```

2. Copy `infra\apache\sao-dts.conf` → `C:\xampp\apache\conf\extra\sao-dts.conf`
   and add at the bottom of `httpd.conf`:

   ```
   Include conf/extra/sao-dts.conf
   ```

3. `C:\xampp\apache\bin\httpd.exe -t` then restart Apache (XAMPP control panel
   or `httpd.exe -k restart`).

The config proxies `/sao_dts/` → Next.js :3000, `/sao_dts/api/` and
`/sao_dts/socket.io/` → API :3001, with a WebSocket upgrade rule (real
websockets work — realtime is instant, request volume drops vs. polling).
`/sao_dts` without a slash redirects to `/sao_dts/`.

## Auto-start on boot — scripts/register-autostart.ps1

Run once, elevated, from the repo root (setup-local-server.ps1 calls it
automatically). The stack comes back **without anyone logging in**:

- **PostgreSQL** — service `postgresql-x64-18` set to Automatic
- **Apache** — installed as a real Windows service (`Apache2.4`) if it isn't
  one already, set to Automatic — no login needed
- **API + web** — scheduled task `sao-pm2-resurrect` runs `pm2 resurrect` at
  system startup as SYSTEM. `PM2_HOME` is set machine-wide to
  `C:\ProgramData\pm2` so the SYSTEM task and your interactive `pm2`
  commands share the same daemon and saved process list — **open a new
  shell** after setup before running `pm2` commands so the env var loads.

## Manual steps if the scripts can't run

1. Install: Node 22, `npm i -g pnpm pm2 pm2-windows-startup`, PostgreSQL 18,
   git. (XAMPP provides Apache already.)
2. `git clone <repo> C:\sao-dts`, create `C:\sao-dts\.env`:

   ```ini
   NODE_ENV=production
   WEB_ORIGIN=http://192.168.2.5,http://localhost
   DATABASE_URL=postgresql://sao:<db-password>@localhost:5432/sao_dts
   SESSION_SECRET=<32+ random chars>
   COOKIE_SECURE=false
   API_PORT=3001
   WEB_PORT=3000
   ADMIN_USERNAME=admin
   ADMIN_EMAIL=admin@example.com
   ADMIN_FULL_NAME=System Administrator
   ADMIN_PASSWORD=<strong password, 12+ chars>
   ```

   `WEB_ORIGIN` = the host users type, **without** `/sao_dts`. Comma-separate
   all forms (hostname + IP + localhost). Do **not** set `API_PROXY_ORIGIN`.
   `DATABASE_URL` port: check `C:\Program Files\PostgreSQL\18\data\
   postgresql.conf` — if an older Postgres already owns 5432, the PG18
   install will be on 5433.
3. Create DB: `CREATE USER sao WITH PASSWORD '...'; CREATE DATABASE sao_dts OWNER sao;`
4. Create `C:\sao-dts\apps\web\.env` (gitignored — must be created manually):

   ```ini
   NEXT_BASE_PATH=/sao_dts
   NEXT_PUBLIC_API_URL=/sao_dts
   ```

5. Build:

   ```powershell
   cd C:\sao-dts
   pnpm install
   pnpm db:generate; pnpm db:deploy; pnpm db:seed
   pnpm build:all   # reads apps/web/.env automatically
   ```

6. Apache config per the section above.
7. Apps: `pm2 start infra\ecosystem.config.cjs`, `pm2 save`, then
   `scripts\register-autostart.ps1`.
8. Neon import (PG18 binaries, drops the seeded schema first):

   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" "<neon-url>" -Fc -f neon-backup.dump
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U sao -d sao_dts -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h localhost -U sao -d sao_dts --no-owner --no-privileges neon-backup.dump
   pm2 restart all
   ```

   `--no-owner` is required (the dump references Neon's `neondb_owner` role).
   Afterwards log in with **existing cloud credentials**.

## Verification checklist

- [ ] `http://localhost/sao_dts/api/health/live` → `{"status":"ok"}`
- [ ] `http://localhost/sao_dts/` → login page loads, login works,
      `sao_session` cookie present
- [ ] `http://192.168.2.5/dogh_ihris` still works (iHRIS untouched)
- [ ] From another LAN machine: `http://192.168.2.5/sao_dts/` loads + logs in
- [ ] Two browsers: edit a document → the other updates live; DevTools →
      Network → `socket.io` shows `101 Switching Protocols`
- [ ] If data was imported: existing documents/users appear
- [ ] Reboot the server → the stack returns with no manual steps
      (`pm2 status` shows both apps, Apache serving iHRIS + /sao_dts)

## Updating later

```powershell
cd C:\sao-dts
git pull
pnpm install
pnpm db:generate; pnpm db:deploy
pnpm build:all          # apps/web/.env still carries NEXT_BASE_PATH
pm2 restart all
```

## Backups

Nightly `pg_dump` via Task Scheduler. Example `C:\sao-dts\backup.bat`:

```bat
set PGPASSWORD=<db-password>
"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U sao -Fc -f "D:\backups\sao_dts_%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%.dump" sao_dts
```

`schtasks /create /tn "SAO DTS Backup" /tr C:\sao-dts\backup.bat /sc daily /st 02:00`

## Alternative: dedicated server (no existing Apache)

If a machine will run *only* this system, skip Apache entirely and use nginx
on port 80 with the app at the root path: copy
`infra\nginx\sao-dts-local.conf` into `C:\nginx\conf\`, replace `nginx.conf`
with the minimal config the setup script writes, and make sure
`apps\web\.env` does **not** exist (root path, same-origin). Then users open
`http://<server>` directly.

## Troubleshooting

- **Login page loads but login fails / no cookie:** `COOKIE_SECURE` isn't
  `false`, or `WEB_ORIGIN` doesn't match the address-bar host exactly
  (scheme + host, no `/sao_dts`, no trailing slash). Fix `.env`,
  `pm2 restart all`.
- **404s on pages/assets under /sao_dts (but / works at :3000):**
  `apps\web\.env` is missing or wasn't present when `next start` launched —
  `next.config.ts` is re-evaluated at runtime. Create the file, rebuild,
  `pm2 restart sao-web`.
- **`pm2 status` shows nothing / different process list:** PM2_HOME isn't
  set in your shell — open a new one after setup (machine env var), or
  `set PM2_HOME=C:\ProgramData\pm2`.
- **Realtime delayed or "polling" only:** `mod_proxy_wstunnel` not enabled or
  the RewriteRule missing — check the sao-dts.conf include is loaded.
- **`Invalid request origin` on POST:** add that host to `WEB_ORIGIN`.
- **App down:** `pm2 status`, `pm2 logs sao-api` / `pm2 logs sao-web`.
- **DB connection errors:** `Get-Service postgresql*` should be Running.

## Notes / trade-offs

- Plain HTTP on the LAN is intentional (`COOKIE_SECURE=false`). For TLS later,
  add an HTTPS vhost in Apache — `SameSite=Lax` cookies work on same-origin
  HTTPS too.
- Neon stays untouched by the migration (dump is read-only). Re-do the import
  at cutover so data added in between isn't lost.
