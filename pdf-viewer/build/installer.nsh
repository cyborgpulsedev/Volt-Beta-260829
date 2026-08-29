; Volt — NSIS customisations layered on electron-builder's template.
;
; electron-builder writes DisplayName, DisplayVersion, DisplayIcon, Publisher,
; UninstallString and QuietUninstallString into the Add/Remove Programs key,
; but not InstallLocation — so Volt showed up in Programs and Features (and to
; every inventory / deployment / cleanup tool that reads that key) with no path
; at all. SHELL_CONTEXT matches the install scope electron-builder chose, so
; this lands in HKCU for the per-user install and HKLM for a machine-wide one.

!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "InstallLocation" "$INSTDIR"
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "InstallLocation"
!macroend
