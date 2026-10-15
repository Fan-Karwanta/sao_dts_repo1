# LAN Deployment Guide — SAO Document Tracking System

Everything runs on one Windows server inside the institution network. Users open
`http://<server>` in a browser; remote staff connect through the office VPN.
No Vercel, no Hostinger, no external rate limits.

```
browser ──► nginx :80 ──► Next.js web   :3000
                │  └──► NestJS API      :3001 ──► PostgreSQL :5432
                └──► /api + /socket.io ─┘
```

## Prerequisites (install once on the server)

| Software | How |
|---|---|
| Node.js 22 LTS | https://nodejs.org installer |
| pnpm | `npm install -g pnpm` (or `npx --yes pnpm@10.17.1` everywhere) |
| PostgreSQL 17 | https://www.postgresql.org/download/windows installer — note the postgres superuser password |
| nginx for Windows | https://nginx.org/en/download.html — unzip to e.g. `C:\nginx` |
| PM2 | `npm install -g pm2 pm2-windows-startup` |
| git | to clone/update the repo |

The server needs a **static IP** or DHCP reservation — ask the network admin.
Optionally also ask them for a local DNS name like `sao-dts` so the URL is
`http://sao-dts` instead of an IP.

## Step 1 — Get the code

```powershell
git clone https://github.com/Fan-Karwanta/sao_dts_repo1.git C:\sao-dts
cd C:\sao-dts
pnpm install
```

## Step 2 — PostgreSQL

1. In pgAdmin or `psql`, create the database and user:

```sql
CREATE USER sao WITH PASSWORD '<strong-password>';
CREATE DATABASE sao_dts OWNER sao;
```

(Alternative: `docker compose up -d postgres` if you prefer Docker — the repo's
`compose.yaml` runs Postgres 17. The native installer is simpler on Windows.)

## Step 3 — `.env` at the repo root

Copy `.env.example` to `.env` and set:

```ini
NODE_ENV=production
# The address users type in the browser. Comma-separate if they use both a
# hostname and the IP — every listed origin must match exactly.
WEB_ORIGIN=http://sao-dts,http://192.168.x.x
DATABASE_URL=postgresql://sao:<strong-password>@localhost:5432/sao_dts
SESSION_SECRET=<at least 32 random characters>
# Plain HTTP on the LAN — without this, Secure cookies are never stored and
# login silently fails.
COOKIE_SECURE=false
API_PORT=3001
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_FULL_NAME=System Administrator
ADMIN_PASSWORD=<strong password, 12+ chars>
```

**Do NOT set `NEXT_PUBLIC_API_URL` or `API_PROXY_ORIGIN`** — nginx serves the
API same-origin, which is what makes the session cookie work everywhere.

## Step 4 — Build and initialize the database

```powershell
pnpm db:generate
pnpm db:deploy      # creates all tables
pnpm db:seed        # creates admin + initial workflow (safe to re-run)
pnpm build:all      # builds contracts, db, api, and web
```

## Step 5 — nginx

1. Copy `infra\nginx\sao-dts-local.conf` somewhere stable (e.g. `C:\nginx\conf\sao-dts-local.conf`).
2. In `C:\nginx\conf\nginx.conf`, inside the `http { ... }` block, add:
   `include conf/sao-dts-local.conf;`
   and remove/comment the default `server { listen 80; ... }` block if it exists.
3. Test + start:

```powershell
C:\nginx\nginx.exe -t
start C:\nginx\nginx.exe
```

To auto-start nginx on boot, register it as a service with
[NSSM](https://nssm.cc): `nssm install nginx C:\nginx\nginx.exe`.

## Step 6 — Run the apps (PM2)

```powershell
cd C:\sao-dts
pm2 start infra\ecosystem.config.cjs
pm2 save
pm2-startup install   # registers PM2 to resurrect on boot
```

Useful commands: `pm2 status`, `pm2 logs sao-api`, `pm2 restart all`.

## Step 7 — Firewall

Allow inbound port 80 only (Postgres stays loopback-only):

```powershell
New-NetFirewallRule -DisplayName "SAO DTS HTTP" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow
```

## Step 8 — Move existing data from Neon (one-time)

On a machine that can reach both databases:

```powershell
# Export from Neon (pg_dump is part of the PostgreSQL install)
pg_dump "postgresql://neondb_owner:...@ep-....neon.tech/neondb?sslmode=require" -Fc -f neon-backup.dump

# Restore into the local server
pg_restore -h <server-ip> -U sao -d sao_dts --clean --if-exists neon-backup.dump
```

Skip `pnpm db:seed`'s fresh data if you restored real data — but re-run it if
the admin account needs creating (it upserts, won't overwrite existing users).

## Step 9 — Verify

- [ ] `http://<server>/api/health/live` → `{"status":"ok"}`
- [ ] `http://<server>` → login as admin works, cookie `sao_session` present
- [ ] Two browsers: edit a document → the other updates live (real WebSocket — check DevTools → Network → `socket.io` request shows **101 Switching Protocols**)
- [ ] Reboot the server once → site comes back on its own

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
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h localhost -U sao -Fc -f "D:\backups\sao_dts_%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%.dump" sao_dts
```

Schedule it daily (`schtasks /create /tn "SAO DTS Backup" /tr C:\sao-dts\backup.bat /sc daily /st 02:00`) and keep copies off the server if you can.

## Notes / trade-offs

- Plain HTTP on the LAN is intentional (`COOKIE_SECURE=false`). If you later
  want HTTPS, generate certs from an internal CA and add a `listen 443 ssl`
  block — the session cookie already uses `SameSite=Lax`, which works on
  same-origin HTTPS too.
- If you ever expose this server to the internet, set `COOKIE_SECURE=true`,
  put real TLS in front, and revisit — that's a different security posture.
- Neon stays untouched as a fallback: pointing `DATABASE_URL` back at it
  switches the DB instantly (the local DB won't have new rows, so pick one).
