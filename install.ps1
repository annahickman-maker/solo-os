# Solo OS one-line installer for Windows (PowerShell)
#
# Usage (from a fresh Windows machine, in PowerShell):
#   iwr -useb https://raw.githubusercontent.com/annahickman-maker/solo-os/main/install.ps1 | iex
#
# What this does:
#   1. Checks for winget (Windows 10 1809+ / Windows 11 ships with it)
#   2. Installs Git if missing
#   3. Installs Node 20 LTS if missing
#   4. Installs the Claude Code CLI if missing
#   5. Prompts to sign into Claude (opens browser)
#   6. Clones the solo-os repo to %USERPROFILE%\Desktop\solo-os
#   7. Runs npm install in server\, frontend\, claude-bridge\
#   8. Creates a "Solo OS" shortcut on the Desktop
#   9. Launches the dashboard
#
# Non-destructive: skips anything that's already installed.

$ErrorActionPreference = 'Stop'

$RepoUrl     = 'https://github.com/annahickman-maker/solo-os.git'
$InstallDir  = Join-Path $env:USERPROFILE 'Desktop\solo-os'
$ShortcutDir = [Environment]::GetFolderPath('Desktop')

function Write-Step($msg)  { Write-Host ""; Write-Host "→ $msg" -ForegroundColor Cyan }
function Write-OK($msg)    { Write-Host "✓ $msg" -ForegroundColor Green }
function Write-Info($msg)  { Write-Host "  $msg" -ForegroundColor DarkGray }
function Write-Warn($msg)  { Write-Host "! $msg" -ForegroundColor Yellow }
function Fail($msg)        {
    Write-Host ""
    Write-Host "Something went wrong: $msg" -ForegroundColor Red
    Write-Host "  Drop this error in the SS community and I'll help you get unstuck."
    exit 1
}

function Refresh-Path {
    # Pull in newly-installed tools without restarting the shell.
    $machine = [System.Environment]::GetEnvironmentVariable('Path','Machine')
    $user    = [System.Environment]::GetEnvironmentVariable('Path','User')
    $env:Path = "$machine;$user"
}

# ─── intro ────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Solo OS installer" -ForegroundColor White
Write-Host "This will set up your local dashboard. About 6 minutes." -ForegroundColor DarkGray
Write-Host ""

# ─── 1. winget ────────────────────────────────────────────────────────────

Write-Step "Checking for winget"
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Fail "winget not found. You need Windows 10 (1809+) or Windows 11. Run Windows Update and try again."
}
Write-OK "winget available."

# ─── 2. Git ───────────────────────────────────────────────────────────────

Write-Step "Checking for Git"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Info "Installing Git..."
    winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
    Refresh-Path
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "Git install didn't complete." }
    Write-OK "Git installed."
} else {
    Write-OK "Git already installed."
}

# ─── 3. Node 20+ ──────────────────────────────────────────────────────────

Write-Step "Checking for Node 20+"
$nodeOK = $false
if (Get-Command node -ErrorAction SilentlyContinue) {
    try {
        $ver = (& node -v).TrimStart('v')
        $major = [int]($ver.Split('.')[0])
        if ($major -ge 20) {
            Write-OK "Node v$ver already installed."
            $nodeOK = $true
        } else {
            Write-Info "Found Node v$ver but need 20 or higher. Upgrading."
        }
    } catch { }
}
if (-not $nodeOK) {
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
    Refresh-Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node install didn't complete." }
    Write-OK "Node $(node -v) installed."
}

# ─── 4. Claude Code CLI ───────────────────────────────────────────────────

Write-Step "Checking for Claude Code CLI"
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Info "Installing Claude Code..."
    npm install -g '@anthropic-ai/claude-code' 2>&1 | Out-Null
    Refresh-Path
    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Fail "Claude Code install didn't complete." }
    Write-OK "Claude Code installed."
} else {
    Write-OK "Claude Code already installed."
}

# ─── 5. Claude auth ───────────────────────────────────────────────────────

Write-Step "Signing into Claude"
& claude auth status 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-OK "Already signed in."
} else {
    Write-Info "Opening your browser to sign in. Come back here when you're done."
    Write-Host ""
    & claude auth login
    if ($LASTEXITCODE -ne 0) { Fail "Claude sign-in didn't complete." }
    Write-OK "Signed in."
}

# ─── 6. Clone the repo ────────────────────────────────────────────────────

Write-Step "Downloading the dashboard"
if (Test-Path $InstallDir) {
    Write-Warn "$InstallDir already exists. Using the existing folder."
    Write-Info "If you want a fresh copy, delete it first and re-run this script."
} else {
    git clone $RepoUrl $InstallDir
    if ($LASTEXITCODE -ne 0) { Fail "Clone failed. Check your internet connection." }
    Write-OK "Downloaded to $InstallDir"
}

# ─── 7. npm install ───────────────────────────────────────────────────────

Write-Step "Installing dependencies (takes about 2 minutes)"
foreach ($sub in 'server', 'frontend', 'claude-bridge') {
    Write-Info "  npm install in $sub\"
    Push-Location (Join-Path $InstallDir $sub)
    try {
        npm install --silent --no-audit --no-fund 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Fail "npm install failed in $sub\" }
    } finally { Pop-Location }
}
Write-OK "Dependencies installed."

# ─── 8. Desktop shortcut ──────────────────────────────────────────────────

Write-Step "Creating Solo OS shortcut on your Desktop"
$shortcutPath = Join-Path $ShortcutDir 'Solo OS.lnk'
$launcherPath = Join-Path $InstallDir 'start-local.ps1'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($shortcutPath)
$sc.TargetPath       = 'powershell.exe'
$sc.Arguments        = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`""
$sc.WorkingDirectory = $InstallDir
$sc.IconLocation     = 'powershell.exe,0'
$sc.Description      = 'Solo OS - your one-person business dashboard'
$sc.Save()
Write-OK "Shortcut created. Double-click 'Solo OS' on your Desktop any time to launch."

# ─── 9. Launch ────────────────────────────────────────────────────────────

Write-Step "Launching Solo OS"
if (Test-Path $launcherPath) {
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcherPath`""
    Write-OK "Solo OS is starting. Your browser will open in about 15 seconds."
} else {
    Write-Warn "Launcher not found at $launcherPath. Open Solo OS by running that file."
}

# ─── done ─────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "You're in." -ForegroundColor Green
Write-Host ""
Write-Host "The dashboard opens at http://localhost:5174 (password dev)."
Write-Host "Next time you want to open it, double-click 'Solo OS' on your Desktop."
Write-Host ""
