# LAN Deployment Guide — SAO Document Tracking System

Everything runs on one Windows server inside the institution network. Users open
`http://<server>` in a browser; remote staff connect through the office VPN.
No Vercel, no Hostinger, no external rate limits.

```
browser ──► nginx :80 ──► Next.js web   :3000
                │  └──► NestJS API      :3001 ──► PostgreSQL :5432
                └──► /api + /socket.io ─┘
```

## For the human: how to trigger this on the server

1. Clone this repo onto the server (or let Devin do it — the script clones it
   itself if given the repo):
   `git clone https://github.com/Fan-Karwanta/sao_dts_repo1.git C:\sao-dts`
2. Install Devin Desktop on the server, open this folder, and paste:

   > This is the local Windows server for the SAO document tracking system.
   > Read DEPLOYMENT-LOCAL.md and execute it: run scripts/setup-local-server.ps1
   > in an elevated PowerShell, answer its prompts (ask me for any values you
   > need), fix any failures, and complete the verification checklist at the
   > bottom of that file. Do not stop until http://localhost loads the login
   > page and a login succeeds.

3. Have these answers ready — the script will ask for them:
   - **Server address** users will type (e.g. `http://sao-dts` or
     `http://192.168.x.x` — ask the network admin for a static IP / DNS name
     first; comma-separate if both will be used)
   - **DB password** for the new `sao` Postgres user (anything strong)
   - **Admin password** for the app's admin account (12+ chars)
   - **Neon DATABASE_URL** if you want existing cloud data imported
     (recommended — it copies every row so users don't re-enter anything;
     the value is in the dev machine's `.env.neon.bak` or the Neon dashboard)

## What the script does (scripts/setup-local-server.ps1)

Run from an **elevated** PowerShell — it installs software and opens the
firewall. It is idempotent: re-running after a failure resumes safely.

1. Installs git, Node.js 22 LTS, pnpm, PM2 (+ boot persistence), PostgreSQL 18,
   and nginx for Windows — all unattended.
   - Postgres **18** is required: Neon runs PG18 and `pg_dump` refuses to export
     from a newer server.
   - The generated postgres superuser password is saved to
     `%TEMP%\pg-superuser.txt`.
2. Clones/updates the repo to `C:\sao-dts`, writes `C:\sao-dts\.env`
   (`COOKIE_SECURE=false` is essential — over plain HTTP, Secure cookies are
   never stored and login would silently fail).
3. Creates the `sao` DB user + `sao_dts` database, runs Prisma migrate + seed,
   builds all packages (`pnpm build:all`).
4. Installs `infra/nginx/sao-dts-local.conf` and a minimal `nginx.conf`
   (the original is kept as `nginx.conf.orig`), starts nginx, registers it as a
   boot-time Scheduled Task.
5. Starts the API + web under PM2 (`pm2 save` + `pm2-startup install` for boot
   persistence).
6. Opens inbound TCP 80 in Windows Firewall.
7. Optionally dumps the Neon database and restores it locally (prompts y/N).
   The restore wipes the freshly-seeded schema first, then imports with
   `--no-owner --no-privileges` (required — the dump references Neon's
   `neondb_owner` role). Afterwards, log in with your **existing cloud
   credentials**, not the seeded admin password.

## Verified on a real Windows install

- Login over `http://localhost` sets the session cookie and authenticates.
- Socket.IO upgrades to a real WebSocket through nginx (`101 Switching
  Protocols`) — realtime is instant and request volume drops sharply vs.
  polling.
- Neon dump → local restore reproduced every table with identical row counts.

## Manual fallback (if the script can't run)

The script just performs these steps — any of them can be done by hand:

1. Install: Node 22 LTS, `npm i -g pnpm pm2 pm2-windows-startup`,
   PostgreSQL 18 (EnterpriseDB installer), nginx for Windows (unzip to
   `C:\nginx`), git.
2. `git clone <repo> C:\sao-dts`, then create `C:\sao-dts\.env`:

   ```ini
   NODE_ENV=production
   WEB_ORIGIN=http://sao-dts,http://192.168.x.x
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

   **Do NOT set `NEXT_PUBLIC_API_URL` or `API_PROXY_ORIGIN`** — nginx serves
   the API same-origin, which is what makes the session cookie work.
3. Create DB: `CREATE USER sao WITH PASSWORD '...'; CREATE DATABASE sao_dts OWNER sao;`
4. `pnpm install && pnpm db:generate && pnpm db:deploy && pnpm db:seed && pnpm build:all`
5. nginx: copy `infra\nginx\sao-dts-local.conf` to `C:\nginx\conf\` and replace
   `nginx.conf` with the minimal config shown in the script (or the commented
   example inside the conf file's header). nginx resolves `include` paths
   relative to `conf/` — write `include sao-dts-local.conf;`. Start with
   `cd C:\nginx; .\nginx.exe -p C:\nginx\`.
6. Apps: `pm2 start C:\sao-dts\infra\ecosystem.config.cjs` then `pm2 save` and
   `pm2-startup install`.
7. Firewall: `New-NetFirewallRule -DisplayName "SAO DTS HTTP" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow`
8. Neon import (use the PG18 binaries):

   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" "<neon-url>" -Fc -f neon-backup.dump
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U sao -d sao_dts -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
   & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h localhost -U sao -d sao_dts --no-owner --no-privileges neon-backup.dump
   pm2 restart all
   ```

## Verification checklist

- [ ] `http://localhost/api/health/live` → `{"status":"ok"}`
- [ ] `http://localhost` → login works; DevTools → Application → Cookies shows
      `sao_session` on `localhost`
- [ ] From another LAN machine: `http://<server>` loads and logs in
- [ ] Two browsers: edit a document → the other updates live. DevTools →
      Network → `socket.io` request shows `101 Switching Protocols`
- [ ] If data was imported: existing documents/users appear, and old cloud
      credentials work
- [ ] Reboot the server → site returns on its own (nginx task + PM2 resurrect)

## Updating later

```powershell
cd C:\sao-dts
git pull
pnpm install
pnpm db:generate
pnpm db:deploy
pnpm build:all
pm2 restart all
```

## Backups

Nightly `pg_dump` via Task Scheduler. Example `C:\sao-dts\backup.bat`:

```bat
set PGPASSWORD=<db-password>
"C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -h localhost -U sao -Fc -f "D:\backups\sao_dts_%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%.dump" sao_dts
```

`schtasks /create /tn "SAO DTS Backup" /tr C:\sao-dts\backup.bat /sc daily /st 02:00`
— keep copies off the server if you can.

## Troubleshooting

- **Login page loads but login fails / no cookie:** `COOKIE_SECURE` isn't
  `false` in `.env`, or `WEB_ORIGIN` doesn't exactly match the address in the
  address bar (scheme + host, no trailing slash). Fix `.env`, `pm2 restart all`.
- **`Invalid request origin` on POST:** same fix — add that origin to the
  `WEB_ORIGIN` comma list.
- **nginx won't start:** `C:\nginx\nginx.exe -t -p C:\nginx\` shows the exact
  error; check `C:\nginx\logs\error.log`.
- **App down:** `pm2 status`, `pm2 logs sao-api` / `pm2 logs sao-web`.
- **DB connection errors:** service `postgresql-x64-18` running?
  `Get-Service postgresql*`

## Notes / trade-offs

- Plain HTTP on the LAN is intentional (`COOKIE_SECURE=false`). To add TLS
  later, issue certs from an internal CA and add a `listen 443 ssl` block —
  `SameSite=Lax` cookies work on same-origin HTTPS too.
- If you ever expose this server to the internet, set `COOKIE_SECURE=true`,
  put real TLS in front, and revisit — that's a different security posture.
- Neon stays untouched by the migration (dump is read-only) — do the import at
  cutover so data added in between isn't lost.
