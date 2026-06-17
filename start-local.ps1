# Solo OS day-2 launcher for Windows.
#
# Spawns the three local services (frontend, server, claude-bridge) and
# opens the dashboard in the default browser. Each service writes to a
# log file under %TEMP%\solo-os-logs\. If a previous run left processes
# on the ports, they get killed first.

$ErrorActionPreference = 'Continue'

$DashDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir  = Join-Path $env:TEMP 'solo-os-logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ─── kill anything on our ports ───────────────────────────────────────────

foreach ($port in 5174, 8789, 8791) {
    try {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    } catch { }
}

# ─── start the three services ─────────────────────────────────────────────

function Start-Service([string]$name, [string]$folder, [string[]]$args) {
    $log = Join-Path $LogDir "$name.log"
    $cwd = Join-Path $DashDir $folder
    Start-Process -FilePath 'npm.cmd' `
        -ArgumentList $args `
        -WorkingDirectory $cwd `
        -RedirectStandardOutput $log `
        -RedirectStandardError "$log.err" `
        -WindowStyle Hidden
}

Start-Service 'server'        'server'        @('start')
Start-Service 'frontend'      'frontend'      @('run', 'dev')
Start-Service 'claude-bridge' 'claude-bridge' @('start')

# ─── wait for the frontend to come up ─────────────────────────────────────

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://localhost:5174' -ErrorAction Stop
        if ($r.StatusCode -lt 500) { $ready = $true; break }
    } catch { }
}

# ─── open the browser ─────────────────────────────────────────────────────

Start-Process 'http://localhost:5174'

if (-not $ready) {
    # Browser is open but the frontend may still be compiling. Refresh after a moment.
    Start-Sleep -Seconds 5
}
