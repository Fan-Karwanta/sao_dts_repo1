# SAO DTS — Windows LAN server bootstrap.
# Run in an ELEVATED PowerShell (Run as Administrator):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-local-server.ps1
#
# Installs prerequisites, clones/updates the repo, configures .env, builds,
# and registers nginx + the apps to start on boot. Idempotent — safe to re-run.
# Companion docs: DEPLOYMENT-LOCAL.md (read it for context and troubleshooting).

#requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$RepoUrl  = "https://github.com/Fan-Karwanta/sao_dts_repo1.git"
$RepoDir  = "C:\sao-dts"
$NginxDir = "C:\nginx"
$SitePort = 80

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ---------- 1. Prerequisites ----------

Write-Step "Node.js 22 LTS"
if (-not (Have node) -or [int](node -v).TrimStart("v").Split(".")[0] -lt 22) {
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
}
node -v

Write-Step "pnpm + PM2"
if (-not (Have pnpm)) { npm install -g pnpm }
if (-not (Have pm2)) { npm install -g pm2 pm2-windows-startup }

Write-Step "PostgreSQL 18"
# Neon runs Postgres 18, and pg_dump can only export from a server whose
# version is <= the tool's — install 18 so the Neon data migration works.
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

Write-Step "nginx for Windows"
if (-not (Test-Path "$NginxDir\nginx.exe")) {
  $page = (Invoke-WebRequest "https://nginx.org/en/download.html" -UseBasicParsing).Content
  $zip  = [regex]::Match($page, 'download/(nginx-[\d.]+)\.zip').Groups[0].Value
  Invoke-WebRequest "https://nginx.org/download/$zip.zip" -OutFile "$env:TEMP\nginx.zip"
  Expand-Archive "$env:TEMP\nginx.zip" -DestinationPath "C:\" -Force
  Move-Item "C:\$zip" $NginxDir
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
  $serverNames = Read-Host "Address users will type (e.g. http://sao-dts or http://192.168.1.50; comma-separate multiple)"
  $dbPass      = Read-Host "New password for the 'sao' PostgreSQL user"
  $adminPass   = Read-Host "Admin account password (12+ chars)"
  $secret      = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  $origins     = ($serverNames -split "," | ForEach-Object { $_.Trim().TrimEnd("/") }) -join ","
  @"
NODE_ENV=production
WEB_ORIGIN=$origins
DATABASE_URL=postgresql://sao:$dbPass@localhost:5432/sao_dts
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

# ---------- 4. Database ----------

Write-Step "PostgreSQL database + user"
$dbUrl = ([regex]::Match((Get-Content $envFile -Raw), 'DATABASE_URL=postgresql://(\S+?)(?::(.+?))?@')).Groups
$saoUser = $dbUrl[1].Value
if ($script:NewDbPass) {
  # Only runs on first setup, right after the .env was created.
  $env:PGPASSWORD = Get-Content "$env:TEMP\pg-superuser.txt"
  & $psql -h localhost -U postgres -c "CREATE USER $saoUser WITH PASSWORD '$($script:NewDbPass)';" -c "CREATE DATABASE sao_dts OWNER $saoUser;"
  Remove-Item Env:PGPASSWORD
}

Write-Step "Install deps, generate client, migrate, seed, build"
pnpm install
npx --yes pnpm@10.17.1 db:generate
npx --yes pnpm@10.17.1 db:deploy
npx --yes pnpm@10.17.1 db:seed
npx --yes pnpm@10.17.1 build:all

# ---------- 5. nginx ----------

Write-Step "nginx config"
Copy-Item "$RepoDir\infra\nginx\sao-dts-local.conf" "$NginxDir\conf\sao-dts-local.conf" -Force
$nginxConf = "$NginxDir\conf\nginx.conf"
if (-not (Select-String -Path $nginxConf -Pattern "sao-dts-local.conf" -Quiet)) {
  Copy-Item $nginxConf "$nginxConf.orig" -Force
  # Write a minimal config rather than patching the stock one — the default
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
  schtasks /create /tn "sao-nginx" /tr "$NginxDir\nginx.exe -p $NginxDir" /sc onstart /ru SYSTEM /f | Out-Null
}
Get-Process nginx -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process "$NginxDir\nginx.exe" -ArgumentList "-p `"$NginxDir`"" -WorkingDirectory $NginxDir

# ---------- 6. Apps via PM2 ----------

Write-Step "PM2 apps + boot persistence"
pm2 start "$RepoDir\infra\ecosystem.config.cjs" --update-env
pm2 save
pm2-startup install

# ---------- 7. Firewall ----------

Write-Step "Firewall"
if (-not (Get-NetFirewallRule -DisplayName "SAO DTS HTTP" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "SAO DTS HTTP" -Direction Inbound -LocalPort $SitePort -Protocol TCP -Action Allow | Out-Null
}

Write-Step "Done"
Write-Host @"
Open http://localhost on this server — the login page should load.
Then from any LAN machine open the WEB_ORIGIN address you entered.

If migrating existing data from Neon, see 'Step 8' in DEPLOYMENT-LOCAL.md.
Logs:   pm2 logs
Status: pm2 status ; curl http://localhost/api/health/live
"@
