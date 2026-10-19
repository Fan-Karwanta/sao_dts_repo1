# SAO DTS --- Windows LAN server bootstrap.
# Run in an ELEVATED PowerShell (Run as Administrator):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-local-server.ps1
#
# Installs prerequisites, clones/updates the repo, configures .env, builds,
# and registers the apps + web server to start on boot. Idempotent --- safe
# to re-run.
#
# Two modes, auto-detected:
#   - XAMPP/Apache present (C:\xampp)  -> app is proxied at /sao_dts next to
#     iHRIS; nginx is skipped entirely.
#   - No XAMPP                       -> dedicated server; nginx serves the app
#     at the root on port 80.
#
# Companion docs: DEPLOYMENT-LOCAL.md (read it for context and troubleshooting).

#requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$RepoUrl     = "https://github.com/Fan-Karwanta/sao_dts_repo1.git"
$RepoDir     = "C:\sao-dts"
$NginxDir    = "C:\nginx"
$SitePort    = 80
$XamppApache = "C:\xampp\apache\bin\httpd.exe"
$UseApache   = Test-Path $XamppApache

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ---------- 1. Prerequisites ----------

Write-Step "git"
if (-not (Have git)) {
  winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}

Write-Step "Node.js 22 LTS"
$nodeMajor = if (Have node) { [int]((node -v).TrimStart("v").Split(".")[0]) } else { 0 }
if ($nodeMajor -lt 22) {
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
node -v

Write-Step "pnpm + PM2"
if (-not (Have pnpm)) { npm install -g pnpm }
if (-not (Have pm2)) { npm install -g pm2 pm2-windows-startup }

Write-Step "PostgreSQL 18"
# Neon runs Postgres 18, and pg_dump can only export from a server whose
# version is <= the tool's --- install 18 so the Neon data migration works.
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
if (-not (Test-Path $psql)) {
  $pgPass = -join ((48..57)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
  # EnterpriseDB silent install; superuser password is generated and saved to
  # $env:TEMP\pg-superuser.txt (delete after verifying you don't need it).
  winget install -e --id PostgreSQL.PostgreSQL.18 --accept-package-agreements --accept-source-agreements `
    --override "--mode unattended --unattendedmodeui none --superpassword $pgPass --servicename postgresql-x64-18 --servicepassword $pgPass"
  $pgPass | Out-File -Encoding ascii "$env:TEMP\pg-superuser.txt"
  Write-Host "postgres superuser password saved to $env:TEMP\pg-superuser.txt"
}

# Detect which port the PG18 instance actually listens on --- if an older
# Postgres already owns 5432, the PG18 installer silently picks 5433.
$pgPort = 5432
$pgConf = "C:\Program Files\PostgreSQL\18\data\postgresql.conf"
if (Test-Path $pgConf) {
  $m = [regex]::Match((Get-Content $pgConf -Raw), '(?m)^\s*port\s*=\s*(\d+)')
  if ($m.Success) { $pgPort = [int]$m.Groups[1].Value }
}
Write-Host "PostgreSQL 18 port: $pgPort"

if ($UseApache) {
  Write-Step "XAMPP Apache detected - nginx skipped (app will live at /sao_dts)"
} else {
Write-Step "nginx for Windows"
if (-not (Test-Path "$NginxDir\nginx.exe")) {
  $page = (Invoke-WebRequest "https://nginx.org/en/download.html" -UseBasicParsing).Content
  $zip  = [regex]::Match($page, 'download/(nginx-[\d.]+)\.zip').Groups[0].Value
  Invoke-WebRequest "https://nginx.org/download/$zip.zip" -OutFile "$env:TEMP\nginx.zip"
  Expand-Archive "$env:TEMP\nginx.zip" -DestinationPath "C:\" -Force
  Move-Item "C:\$zip" $NginxDir
}
}

# ---------- 2. Repository ----------

Write-Step "Clone / update repo"
if (Test-Path "$RepoDir\.git") {
  git -C $RepoDir pull --ff-only
} else {
  git clone $RepoUrl $RepoDir
}
Set-Location $RepoDir

# ---------- 3. Environment ----------

Write-Step ".env"
$envFile = "$RepoDir\.env"
if (-not (Test-Path $envFile)) {
  $serverNames = Read-Host "Address users will type (e.g. http://sao-dts or http://192.168.2.5; comma-separate multiple; NO /sao_dts path, no trailing slash)"
  $dbPass      = Read-Host "New password for the 'sao' PostgreSQL user (letters/numbers only - no @ or :)"
  $adminPass   = Read-Host "Admin account password (12+ chars)"
  $secret      = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  $origins     = ($serverNames -split "," | ForEach-Object { $_.Trim().TrimEnd("/") }) -join ","
  @"
NODE_ENV=production
WEB_ORIGIN=$origins
DATABASE_URL=postgresql://sao:$dbPass@localhost:$pgPort/sao_dts
SESSION_SECRET=$secret
COOKIE_SECURE=false
API_PORT=3001
WEB_PORT=3000
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_FULL_NAME=System Administrator
ADMIN_PASSWORD=$adminPass
"@ | Out-File -Encoding utf8 $envFile
  Write-Host "Wrote $envFile"
  $script:NewDbPass = $dbPass
}

# apps/web/.env: `next build` AND `next start` both evaluate next.config.ts,
# so NEXT_BASE_PATH must be present at RUNTIME too -- a build-time-only env
# var leaves a server that 404s every /sao_dts/* route. This file (gitignored)
# guarantees both stages see it.
$webEnvFile = "$RepoDir\apps\web\.env"
if ($UseApache -and -not (Test-Path $webEnvFile)) {
  @"
NEXT_BASE_PATH=/sao_dts
NEXT_PUBLIC_API_URL=/sao_dts
"@ | Out-File -Encoding ascii $webEnvFile
  Write-Host "Wrote $webEnvFile (sub-path build+runtime config)"
}

# ---------- 4. Database ----------

Write-Step "PostgreSQL database + user"
$dbUrl = ([regex]::Match((Get-Content $envFile -Raw), 'DATABASE_URL=postgresql://(\S+?)(?::(.+?))?@')).Groups
$saoUser = $dbUrl[1].Value
if ($script:NewDbPass) {
  # Only runs on first setup, right after the .env was created.
  $env:PGPASSWORD = Get-Content "$env:TEMP\pg-superuser.txt"
  & $psql -h localhost -p $pgPort -U postgres -c "CREATE USER $saoUser WITH PASSWORD '$($script:NewDbPass)';" -c "CREATE DATABASE sao_dts OWNER $saoUser;"
  Remove-Item Env:PGPASSWORD
}

Write-Step "Install deps, generate client, migrate, seed, build"
pnpm install
npx --yes pnpm@10.17.1 db:generate
npx --yes pnpm@10.17.1 db:deploy
npx --yes pnpm@10.17.1 db:seed
npx --yes pnpm@10.17.1 build:all

# ---------- 5. Front door: Apache (XAMPP) or nginx ----------

if ($UseApache) {
  Write-Step "Apache reverse proxy for /sao_dts"
  $httpdConf = "C:\xampp\apache\conf\httpd.conf"
  $extraDir  = "C:\xampp\apache\conf\extra"
  Copy-Item "$RepoDir\infra\apache\sao-dts.conf" "$extraDir\sao-dts.conf" -Force

  # Uncomment the proxy modules XAMPP ships disabled.
  $conf = Get-Content $httpdConf -Raw
  foreach ($mod in "proxy_module","proxy_http_module","proxy_wstunnel_module","rewrite_module") {
    $conf = $conf -replace "#\s*LoadModule $mod ", "LoadModule $mod "
  }
  if ($conf -notmatch "sao-dts\.conf") {
    $conf = $conf.TrimEnd() + "`r`nInclude conf/extra/sao-dts.conf`r`n"
  }
  Set-Content $httpdConf $conf -Encoding ascii

  & $XamppApache -t
  if ($LASTEXITCODE -ne 0) { throw "Apache config test failed -- fix httpd.conf / sao-dts.conf before continuing." }

  # Restart Apache so the proxy is live (service if registered, else -k restart).
  # If Apache isn't running yet, -k restart fails harmlessly --- register-
  # autostart.ps1 below installs it as a service and starts it anyway.
  $apacheSvc = Get-Service | Where-Object { $_.Name -like "*apache*" } | Select-Object -First 1
  if ($apacheSvc) { Restart-Service $apacheSvc.Name -Force }
  else { & $XamppApache -k restart 2>$null | Out-Null }
} else {
  Write-Step "nginx config"
  Copy-Item "$RepoDir\infra\nginx\sao-dts-local.conf" "$NginxDir\conf\sao-dts-local.conf" -Force
  $nginxConf = "$NginxDir\conf\nginx.conf"
  if (-not (Select-String -Path $nginxConf -Pattern "sao-dts-local.conf" -Quiet)) {
    Copy-Item $nginxConf "$nginxConf.orig" -Force
    # Write a minimal config rather than patching the stock one --- the default
    # server block contains nested locations that are hard to strip reliably.
    @"
worker_processes  1;
events { worker_connections  1024; }
http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;
    include       sao-dts-local.conf;
}
"@ | Set-Content $nginxConf -Encoding ascii
  }
  & "$NginxDir\nginx.exe" -t -p "$NginxDir\"

  Write-Step "nginx auto-start (Task Scheduler)"
  if (-not (Get-ScheduledTask -TaskName "sao-nginx" -ErrorAction SilentlyContinue)) {
    schtasks /create /tn "sao-nginx" /tr "`"$NginxDir\nginx.exe`" -p `"$NginxDir\`"" /sc onstart /ru SYSTEM /f | Out-Null
  }
  Get-Process nginx -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Process "$NginxDir\nginx.exe" -ArgumentList "-p `"$NginxDir`"" -WorkingDirectory $NginxDir
}

# ---------- 6. Apps via PM2 ----------

Write-Step "PM2 apps + boot persistence"
# PM2_HOME on a machine-wide, non-profile path so the SYSTEM account's boot
# task and interactive shells share the same PM2 daemon + saved process list.
[Environment]::SetEnvironmentVariable("PM2_HOME", "C:\ProgramData\pm2", "Machine")
$env:PM2_HOME = "C:\ProgramData\pm2"
New-Item -ItemType Directory -Force $env:PM2_HOME | Out-Null
icacls $env:PM2_HOME /grant "BUILTIN\Users:(OI)(CI)M" /T | Out-Null

pm2 start "$RepoDir\infra\ecosystem.config.cjs" --update-env
pm2 save

# Boot/logon/Apache persistence (idempotent).
& "$RepoDir\scripts\register-autostart.ps1"

# ---------- 7. Firewall ----------

Write-Step "Firewall"
if (-not (Get-NetFirewallRule -DisplayName "SAO DTS HTTP" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "SAO DTS HTTP" -Direction Inbound -LocalPort $SitePort -Protocol TCP -Action Allow | Out-Null
}

# ---------- 8. Optional Neon data import ----------

Write-Step "Migrate existing data from Neon (optional)"
$doImport = Read-Host "Import all existing data from the Neon database now? (y/N)"
if ($doImport -match "^[yY]") {
  $neonUrl = Read-Host "Paste the Neon DATABASE_URL (from the cloud .env / Neon dashboard)"
  $dump    = "$env:TEMP\neon-backup.dump"
  $pgBin   = Split-Path $psql
  & "$pgBin\pg_dump.exe" "$neonUrl" -Fc -f $dump
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed --- check the Neon URL and network." }

  # Reset the local schema so the restore doesn't collide with seeded objects.
  $env:PGPASSWORD = ([regex]::Match((Get-Content $envFile -Raw), 'DATABASE_URL=postgresql://\S+?:(.+?)@')).Groups[1].Value
  & $psql -h localhost -p $pgPort -U $saoUser -d sao_dts -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  # --no-owner is required: the dump references Neon's neondb_owner role.
  & "$pgBin\pg_restore.exe" -h localhost -p $pgPort -U $saoUser -d sao_dts --no-owner --no-privileges $dump
  Remove-Item Env:PGPASSWORD
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed --- see errors above." }
  pm2 restart all --update-env
  Write-Host "Neon data imported. Log in with your existing cloud credentials."
}

Write-Step "Done"
$appUrl = if ($UseApache) { "http://localhost/sao_dts/" } else { "http://localhost" }
Write-Host @"
Open $appUrl on this server --- the login page should load.
Then from any LAN machine open the WEB_ORIGIN address you entered
$(if ($UseApache) { "with /sao_dts appended, e.g. http://192.168.2.5/sao_dts/" } else { "" }).

Logs:   pm2 logs          (in a NEW shell so PM2_HOME is picked up)
Status: pm2 status ; curl http://localhost$(if ($UseApache) { "/sao_dts" })/api/health/live
"@
