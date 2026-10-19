# SAO DTS --- register everything needed to start the stack on boot.
# Run once, in an elevated PowerShell, from the repo root:
#   powershell -ExecutionPolicy Bypass -File scripts\register-autostart.ps1
#
# What gets auto-started (in order, no login required):
#   postgresql-x64-18  - Windows service, set to Automatic
#   Apache (XAMPP)     - installed as a Windows service if it isn't already
#   sao-api + sao-web  - `pm2 resurrect` at system startup as SYSTEM, using a
#                        shared PM2_HOME=C:\ProgramData\pm2 so the SYSTEM task
#                        and your interactive `pm2` commands see the same
#                        daemon and saved process list.
# Idempotent - safe to re-run.

#requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$RepoDir = "C:\sao-dts"
$Pm2Home = "C:\ProgramData\pm2"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ---------- PostgreSQL ----------
Write-Step "PostgreSQL service -> Automatic"
$pgService = Get-Service "postgresql-x64-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pgService) {
  Set-Service $pgService.Name -StartupType Automatic
  if ($pgService.Status -ne "Running") { Start-Service $pgService.Name }
  Write-Host "$($pgService.Name): $($pgService.Status)"
} else {
  Write-Host "No PostgreSQL service found - install PostgreSQL 18 first."
}

# ---------- Node apps via PM2 (boot, no login needed) ----------
Write-Step "PM2 resurrect at system startup"
$pm2Cmd = (Get-Command pm2 -ErrorAction SilentlyContinue).Source
if ($pm2Cmd) {
  # Shared PM2_HOME so SYSTEM (boot task) and the admin user share one daemon.
  if ([Environment]::GetEnvironmentVariable("PM2_HOME","Machine") -ne $Pm2Home) {
    [Environment]::SetEnvironmentVariable("PM2_HOME", $Pm2Home, "Machine")
    Write-Host "PM2_HOME=$Pm2Home set machine-wide (open a NEW shell before `pm2` commands)"
  }
  $env:PM2_HOME = $Pm2Home
  New-Item -ItemType Directory -Force $Pm2Home | Out-Null
  icacls $Pm2Home /grant "BUILTIN\Users:(OI)(CI)M" /T | Out-Null

  # A .bat keeps the scheduled-task command line simple and quote-free.
  $bat = "$RepoDir\scripts\pm2-resurrect.bat"
  @"
@echo off
set "PM2_HOME=$Pm2Home"
"$pm2Cmd" resurrect
"@ | Set-Content $bat -Encoding ascii

  $trigger  = New-ScheduledTaskTrigger -AtStartup
  $action   = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $RepoDir
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName "sao-pm2-resurrect" -Trigger $trigger -Action $action `
    -Principal (New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest) `
    -Settings $settings -Force | Out-Null
  Write-Host "Scheduled task 'sao-pm2-resurrect' registered (runs as SYSTEM at startup)"

  pm2 resurrect 2>$null | Out-Null  # start now if a dump already exists
  pm2 save | Out-Null
} else {
  Write-Host "pm2 not found - run setup-local-server.ps1 first."
}

# ---------- Apache (XAMPP) ----------
Write-Step "Apache auto-start"
$apache = "C:\xampp\apache\bin\httpd.exe"
if (Test-Path $apache) {
  $existing = Get-Service | Where-Object { $_.Name -like "*apache*" } | Select-Object -First 1
  if ($existing) {
    Set-Service $existing.Name -StartupType Automatic
    Write-Host "$($existing.Name): set to Automatic"
  } else {
    # Proper Windows service (same thing XAMPP's control-panel checkbox does)
    # - gets Automatic start + service recovery, no login required.
    & $apache -k install -n "Apache2.4"
    Set-Service "Apache2.4" -StartupType Automatic
    Start-Service "Apache2.4"
    Write-Host "Apache2.4 installed as a service and started"
  }
} else {
  Write-Host "No XAMPP Apache found - skipping (nginx/dedicated setups don't need this)."
}

Write-Step "Done"
Write-Host @"
Boot order is self-ordering: Postgres starts as a service, the sao-pm2-resurrect
task fires at startup (apps wait on nothing - Node boots in seconds), Apache is
a service. Verify after the next reboot:
  pm2 status                         (sao-api + sao-web online)
  curl http://localhost/sao_dts/api/health/live
  curl http://localhost/dogh_ihris   (iHRIS untouched)
"@
