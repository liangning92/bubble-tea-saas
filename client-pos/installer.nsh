# Manual upgrade: no automatic process killing, no database replacement.
!include "FileFunc.nsh"
!ifndef BUILD_UNINSTALLER
Var BTPSOldApp
Var BTPSUpgradeReceipt
Var BTPSInstallStarted
Var BTPSUpgradeDiagnostic
!endif

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Function BTPSWaitForClosedPOS
      CreateDirectory "$APPDATA\BTPS\logs"
      btps_wait_again:
      ${If} $BTPSOldApp != ""
        nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" request-stop --old-app "$BTPSOldApp" --diagnostic "$BTPSUpgradeDiagnostic"'
      ${Else}
        nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" wait-stopped --diagnostic "$BTPSUpgradeDiagnostic"'
      ${EndIf}
      Pop $R0
      Pop $R1
      ${If} $R0 == "74"
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Automatic POS shutdown has not completed. Resolve any prompt shown by POS, then click Retry to request shutdown again. Your orders and original program are retained. Details: $R1$\r$\n收银程序或本地服务尚未自动退出。请处理收银窗口中的提示，然后点击重试，安装器会再次自动关闭程序。订单和原程序保留。$\r$\nPOS atau layanan lokal belum ditutup otomatis. Selesaikan pesan di POS, lalu klik Retry untuk mencoba penutupan otomatis lagi. Pesanan dan program lama tetap disimpan." /SD IDCANCEL IDRETRY btps_wait_again
        SetErrorLevel 73
        Quit
      ${ElseIf} $R0 != "0"
        MessageBox MB_OK|MB_ICONSTOP "Unable to verify POS shutdown. No replacement. Details: $R1$\r$\n无法确认收银已退出，未替换程序。$\r$\nTidak dapat memverifikasi POS sudah ditutup; program belum diganti." /SD IDOK
        SetErrorLevel 73
        Quit
      ${EndIf}
    FunctionEnd
    Function .onInstFailed
      ${If} $BTPSInstallStarted == "1"
      ${AndIf} $BTPSUpgradeReceipt != ""
        StrCpy $BTPSInstallStarted "0"
        nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" restore --receipt "$BTPSUpgradeReceipt"'
        Pop $R0
        Pop $R1
        ${If} $R0 != "0"
          MessageBox MB_OK|MB_ICONSTOP "Installation failed. Keep POS closed and contact the manager. Database and program backups are retained.$\r$\n安装失败，请保持收银关闭并联系负责人。数据及程序备份保留。$\r$\nInstalasi gagal. Jangan buka POS; hubungi pengelola. Cadangan data dan program disimpan." /SD IDOK
        ${Else}
          MessageBox MB_OK|MB_ICONINFORMATION "Installation failed; the old program was restored. Data and backups are retained.$\r$\n安装失败，已恢复原程序，数据及备份保留。$\r$\nInstalasi gagal; program lama dipulihkan. Data dan cadangan disimpan." /SD IDOK
        ${EndIf}
      ${EndIf}
    FunctionEnd
  !endif
!macroend

!macro customInit
  StrCpy $BTPSInstallStarted "0"
  StrCpy $BTPSUpgradeReceipt ""
  StrCpy $BTPSUpgradeDiagnostic "$APPDATA\BTPS\logs\upgrade-check.json"
  ReadRegStr $BTPSOldApp HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $BTPSOldApp == ""
    ReadRegStr $BTPSOldApp HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  ${If} $BTPSOldApp == ""
  ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    StrCpy $BTPSOldApp "$INSTDIR"
  ${EndIf}
  InitPluginsDir
  File /oname=$PLUGINSDIR\btps-db-upgrade.exe "${BUILD_RESOURCES_DIR}\upgrade-helper\btps-db-upgrade.exe"
!macroend

!ifndef BUILD_UNINSTALLER
!macro customCheckAppRunning
  # Keep NSIS initialization fast so the installation window appears before
  # process handoff, final backup verification, and schema migration.
  ${If} $BTPSOldApp != ""
  ${OrIf} ${FileExists} "$APPDATA\BTPS\data\dev.db"
  ${OrIf} ${FileExists} "$APPDATA\bubble-tea-saas\data\dev.db"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\BTPS\data\dev.db"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\bubble-tea-saas\data\dev.db"
    # Only the in-app updater may perform a silent upgrade. Both paths still
    # verify shutdown, original profile, backups and schema before replacement.
    ${GetParameters} $R4
    ClearErrors
    ${GetOptions} $R4 "--updated" $R5
    IfErrors btps_manual_upgrade btps_upgrade_confirmed
    btps_manual_upgrade:
    ${If} ${Silent}
      SetErrorLevel 73
      Quit
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Finish the current payment before installing. Setup will automatically close this POS, install the update, and restart it. Continue?$\r$\n请先完成当前收款。安装器将自动关闭本机收银程序、安装更新并重新启动。是否继续？$\r$\nSelesaikan pembayaran saat ini. Instalasi akan menutup POS otomatis, memasang pembaruan, dan membuka POS kembali. Lanjutkan?" IDYES btps_upgrade_confirmed
    SetErrorLevel 73
    Quit
    btps_upgrade_confirmed:
    StrCpy $BTPSUpgradeReceipt "$PLUGINSDIR\upgrade-result.json"
    CreateDirectory "$APPDATA\BTPS\logs"
    ${If} $INSTDIR != $BTPSOldApp
      MessageBox MB_OK|MB_ICONSTOP "Use the original installation directory.$\r$\n请选择原安装目录。$\r$\nGunakan direktori instalasi lama." /SD IDOK
      SetErrorLevel 73
      Quit
    ${EndIf}
    btps_prepare_again:
    nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" prepare-install --old-app "$BTPSOldApp" --result "$BTPSUpgradeReceipt" --operator-confirmed --installer "$EXEPATH" --staged-pointer "$APPDATA\BTPS\upgrade-stage.json" --diagnostic "$BTPSUpgradeDiagnostic"'
    Pop $R0
    Pop $R1
    ${If} $R0 == "74"
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Automatic POS shutdown has not completed. Resolve any prompt shown by POS, then click Retry to request shutdown again. Your orders and original program are retained. Details: $R1$\r$\n收银程序或本地服务尚未自动退出。请处理收银窗口中的提示，然后点击重试，安装器会再次自动关闭程序。订单和原程序保留。$\r$\nPOS atau layanan lokal belum ditutup otomatis. Selesaikan pesan di POS, lalu klik Retry untuk mencoba penutupan otomatis lagi. Pesanan dan program lama tetap disimpan." /SD IDCANCEL IDRETRY btps_prepare_again
      SetErrorLevel 73
      Quit
    ${ElseIf} $R0 != "0"
      StrCpy $R3 $R1
      FileOpen $R2 "$BTPSUpgradeDiagnostic" r
      ${IfNot} ${Errors}
        FileRead $R2 $R3
        FileClose $R2
      ${EndIf}
      MessageBox MB_OK|MB_ICONSTOP "Upgrade stopped before replacing your program. Exit code: $R0. Reason: $R3$\r$\nCheck: $BTPSUpgradeDiagnostic$\r$\n升级已停止，原程序保留。请联系负责人并提供上方检查文件。$\r$\nPeningkatan dihentikan; program lama disimpan. Hubungi pengelola." /SD IDOK
      SetErrorLevel 73
      Quit
    ${EndIf}
  ${Else}
    # Fresh installations still reject an active POS/local service. Existing
    # installations perform this check and full receipt verification inside
    # prepare-install immediately before returning to file replacement.
    nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" wait-stopped --timeout 0'
    Pop $R0
    Pop $R1
    ${If} $R0 == "74"
      Call BTPSWaitForClosedPOS
    ${ElseIf} $R0 != "0"
      MessageBox MB_OK|MB_ICONSTOP "Unable to verify POS shutdown. No program replacement.$\r$\n无法确认收银已退出，未替换程序。$\r$\nTidak dapat memverifikasi POS sudah ditutup; program belum diganti." /SD IDOK
      SetErrorLevel 73
      Quit
    ${EndIf}
    nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" check-stopped'
    Pop $R0
    Pop $R1
    ${If} $R0 != "0"
      MessageBox MB_OK|MB_ICONSTOP "Close POS and retry. Upgrade checks failed; no program replacement.$\r$\n请关闭收银后重试，检查失败，未替换程序。$\r$\nTutup POS dan coba lagi. Pemeriksaan gagal; program tidak diganti." /SD IDOK
      SetErrorLevel 73
      Quit
    ${EndIf}
  ${EndIf}
  StrCpy $BTPSInstallStarted "1"
!macroend
!endif

# Disable CRC check for installer and uninstaller
CRCCheck off

!macro BTPSRepairShortcut link
  ClearErrors
  CreateShortCut "${link}" "$appExe" "" "$appExe" 0 SW_SHOWNORMAL "" "${APP_DESCRIPTION}"
  ${If} ${Errors}
    DetailPrint "Unable to refresh BTPS shortcut: ${link}"
  ${Else}
    WinShell::SetLnkAUMI "${link}" "${APP_ID}"
  ${EndIf}
  ClearErrors
!macroend

!macro customInstall
  # 启用 Windows LongPaths 支持（解除260字符路径限制）
  # 使用 HKCU（当前用户注册表），无需管理员权限
  WriteRegDWORD HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\FileSystem" "LongPathsEnabled" 1

  # electron-builder preserves missing/stale links during --updated installs.
  # Repair both canonical links after the old uninstaller has finished. Use
  # builder's paths so current-user/all-users and redirected folders agree.
  SetOutPath "$INSTDIR"
  !insertmacro createMenuDirectory
  !insertmacro BTPSRepairShortcut "$newStartMenuLink"
  ${IfNot} ${isNoDesktopShortcut}
    !insertmacro BTPSRepairShortcut "$newDesktopLink"
  ${EndIf}
  # Retain an existing legacy entry without creating two icons on fresh installs.
  ${If} ${FileExists} "$DESKTOP\BubbleTeaPOS.lnk"
    !insertmacro BTPSRepairShortcut "$DESKTOP\BubbleTeaPOS.lnk"
  ${EndIf}
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  # 卸载时不关闭 LongPaths（其他应用可能也用）
  # Upgrades invoke the old uninstaller too. Canonical links are managed by
  # builder; remove legacy entries only on an actual uninstall.
  ${IfNot} ${isUpdated}
    Delete "$DESKTOP\BubbleTeaPOS.lnk"
    Delete "$DESKTOP\BTPS 日志.lnk"
  ${EndIf}
!macroend
