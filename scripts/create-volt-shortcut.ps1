# Creates a desktop shortcut that launches the Volt desktop app
# (an Electron app — its own window, no browser tab). The shortcut targets
# wscript.exe running scripts\start-volt-app-hidden.vbs, which starts
# start-volt-app.cmd with its console window HIDDEN — so double-clicking the
# shortcut behaves like a normal program: only the app window appears, no
# command-prompt box. Also adds a matching app icon (assets/volt.ico) and
# registers the .pdf file association (scripts\register-volt-file-assoc.ps1)
# so a fresh machine gets both the shortcut and the association in one step.
# If Volt's Electron runtime isn't installed yet, the association is deferred
# (the launcher finishes it on first launch) — the shortcut is still created.
# Run:   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-volt-shortcut.ps1
# Shortcut only (no .pdf association):  ... -SkipAssociation
param(
    [switch]$SkipAssociation  # create the shortcut only; leave .pdf association alone
)

$project = Split-Path $PSScriptRoot -Parent
$launcher = Join-Path $project 'scripts\start-volt-app-hidden.vbs'
$assetsDir = Join-Path $project 'pdf-viewer\assets'
$icoPath = Join-Path $assetsDir 'volt.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'Volt PDF Reader.lnk'

# ── app icon ────────────────────────────────────────────────────────
# The official brand icon ships at pdf-viewer/assets/volt.ico (generated
# from assets/volt-icon-transparent-1.png by scripts/gen-icons.cjs).
# This script must NEVER draw or overwrite it — an earlier version painted
# a placeholder "V" here and silently clobbered the real artwork.
if (-not (Test-Path $icoPath)) {
    Write-Host "Warning: $icoPath is missing - run 'npx electron scripts/gen-icons.cjs' in pdf-viewer to regenerate it." -ForegroundColor Yellow
}

# ── create the shortcut ─────────────────────────────────────────────
# Target wscript.exe running the hidden VBS launcher: the app starts with NO
# console window (window style 0 inside the VBS), so the shortcut behaves
# like a normal executable — only the app's window and taskbar icon appear.
$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = "$env:SystemRoot\System32\wscript.exe"
$lnk.Arguments = "`"$launcher`""
$lnk.WorkingDirectory = $project
$lnk.Description = 'Volt — local, private, AI-powered PDF reader (desktop app)'
$lnk.IconLocation = "$icoPath,0"
$lnk.Save()

$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Volt PDF Reader.lnk'
$lnk2 = $ws.CreateShortcut($startMenu)
$lnk2.TargetPath = $lnk.TargetPath
$lnk2.Arguments = $lnk.Arguments
$lnk2.WorkingDirectory = $lnk.WorkingDirectory
$lnk2.Description = $lnk.Description
$lnk2.IconLocation = $lnk.IconLocation
$lnk2.Save()

Write-Host "Start Menu entry created: $startMenu"
Write-Host "Shortcut created: $lnkPath"
Write-Host "Icon: $icoPath"

# ── register the .pdf file association (one step for a fresh machine) ─────
# Mirrors what start-volt-app.cmd does on launch: idempotent, HKCU-only, and
# -Silent so it never prompts or blocks here. If Electron isn't installed yet
# the launcher will finish the association on the first app launch — the
# shortcut has still been created, so this script deliberately exits 0 either
# way (association is best-effort, exactly how the launcher treats it).
if (-not $SkipAssociation) {
    $assocScript = Join-Path $PSScriptRoot 'register-volt-file-assoc.ps1'
    try {
        & $assocScript -Silent
        if ($LASTEXITCODE -eq 0) {
            # exit 0 covers both "registered" and "left alone" (Volt registered
            # before, but the user has since re-associated .pdf elsewhere and
            # the script respected that) — verify what actually happened so the
            # message is never a lie
            $cur = (Get-ItemProperty 'HKCU:\Software\Classes\.pdf' -Name '(default)' -ErrorAction SilentlyContinue).'(default)'
            if ($cur -eq 'Volt.PDF') {
                Write-Host 'PDF association registered: double-clicking a .pdf now opens it in Volt.' -ForegroundColor Green
            } else {
                Write-Host ".pdf is associated with '$cur' — left as you had it." -ForegroundColor DarkGray
            }
        } else {
            Write-Host "PDF association deferred: Volt's Electron runtime isn't installed yet." -ForegroundColor Yellow
            Write-Host '  Launch the app once (start-volt-app.cmd — it downloads Electron and registers' -ForegroundColor Yellow
            Write-Host '  the association automatically), or re-run this script afterwards.' -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Could not register the .pdf association: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host '  Re-run scripts\register-volt-file-assoc.ps1 after the first app launch.' -ForegroundColor Yellow
    }
}
