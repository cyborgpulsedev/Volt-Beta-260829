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

  ; electron-builder deletes its own "Volt PDF" ProgID key on uninstall but
  ; leaves Software\Classes\.pdf still NAMING it, so the per-user file
  ; association is left pointing at a program that no longer exists. Clear
  ; that value — but only while it is still ours: if the user has since
  ; chosen another reader, theirs is what is written there.
  ReadRegStr $0 SHELL_CONTEXT "Software\Classes\.pdf" ""
  StrCmp $0 "Volt PDF" 0 +2
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.pdf" ""

  ; The updater keeps the installers it downloads in its own cache under
  ; LOCALAPPDATA, and nothing ever removes them: a beta pass measured 231 MB
  ; still sitting there after a clean uninstall. The name matches
  ; updaterCacheDirName in the build config. User DATA is deliberately left
  ; alone (deleteAppDataOnUninstall is false) - this is only the cache.
  RMDir /r "$LOCALAPPDATA\volt-pdf-reader-updater"
!macroend
