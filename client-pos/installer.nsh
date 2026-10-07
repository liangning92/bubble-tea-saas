# Manual upgrade: no automatic process killing, no database replacement.
Var BTPSOldApp
Var BTPSUpgradeReceipt
Var BTPSInstallStarted

!macro customHeader
  !ifndef BUILD_UNINSTALLER
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
  ReadRegStr $BTPSOldApp HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $BTPSOldApp == ""
    ReadRegStr $BTPSOldApp HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  ${If} $BTPSOldApp == ""
  ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    StrCpy $BTPSOldApp "$INSTDIR"
  ${EndIf}
  ${If} $BTPSOldApp != ""
  ${OrIf} ${FileExists} "$APPDATA\BTPS\data\dev.db"
  ${OrIf} ${FileExists} "$APPDATA\bubble-tea-saas\data\dev.db"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\BTPS\data\dev.db"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\bubble-tea-saas\data\dev.db"
    ${If} ${Silent}
      SetErrorLevel 73
      Quit
    ${EndIf}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Finish all payments and close POS normally before continuing. This manual upgrade backs up local data and the old program, then adds only pickup number and two duplicate-payment protection fields, plus the pickup index. Continue?$\r$\n完成付款并正常关闭收银后再继续。将备份本地数据和旧程序，仅增加取餐号及两项防重复付款字段和取餐号索引。是否继续？$\r$\nSelesaikan pembayaran dan tutup POS dahulu. Data lokal dan program lama dicadangkan; hanya kolom nomor pengambilan, dua kolom pencegah pembayaran ganda, dan indeks pengambilan ditambahkan. Lanjutkan?" IDYES btps_upgrade_confirmed
    SetErrorLevel 73
    Quit
    btps_upgrade_confirmed:
    InitPluginsDir
    File /oname=btps-db-upgrade.exe "${BUILD_RESOURCES_DIR}\upgrade-helper\btps-db-upgrade.exe"
    StrCpy $BTPSUpgradeReceipt "$PLUGINSDIR\upgrade-result.json"
    nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" prepare --old-app "$BTPSOldApp" --result "$BTPSUpgradeReceipt" --operator-confirmed'
    Pop $R0
    Pop $R1
    ${If} $R0 != "0"
      MessageBox MB_OK|MB_ICONSTOP "Upgrade stopped before replacing your program. Keep POS closed and contact the manager. Error: $R1$\r$\n升级已停止，原程序保留。请联系负责人。$\r$\nPeningkatan dihentikan; program lama disimpan. Hubungi pengelola." /SD IDOK
      SetErrorLevel 73
      Quit
    ${EndIf}
  ${Else}
    InitPluginsDir
    File /oname=btps-db-upgrade.exe "${BUILD_RESOURCES_DIR}\upgrade-helper\btps-db-upgrade.exe"
  ${EndIf}
!macroend

!macro customCheckAppRunning
  ${If} $BTPSUpgradeReceipt != ""
    ${If} $INSTDIR != $BTPSOldApp
      MessageBox MB_OK|MB_ICONSTOP "Use the original installation directory.$\r$\n请选择原安装目录。$\r$\nGunakan direktori instalasi lama." /SD IDOK
      SetErrorLevel 73
      Quit
    ${EndIf}
    nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" verify --receipt "$BTPSUpgradeReceipt"'
  ${Else}
    nsExec::ExecToStack '"$PLUGINSDIR\btps-db-upgrade.exe" check-stopped'
  ${EndIf}
  Pop $R0
  Pop $R1
  ${If} $R0 != "0"
    MessageBox MB_OK|MB_ICONSTOP "Close POS and retry. Upgrade checks failed; no program replacement.$\r$\n请关闭收银后重试，检查失败，未替换程序。$\r$\nTutup POS dan coba lagi. Pemeriksaan gagal; program tidak diganti." /SD IDOK
    SetErrorLevel 73
    Quit
  ${EndIf}
  StrCpy $BTPSInstallStarted "1"
!macroend

# Disable CRC check for installer and uninstaller
CRCCheck off

!macro customInstall
  # 启用 Windows LongPaths 支持（解除260字符路径限制）
  # 使用 HKCU（当前用户注册表），无需管理员权限
  WriteRegDWORD HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\FileSystem" "LongPathsEnabled" 1

  # 创建桌面快捷方式
  CreateShortcut "$DESKTOP\BTPS.lnk" "$INSTDIR\BTPS.exe"
  CreateShortcut "$DESKTOP\BubbleTeaPOS.lnk" "$INSTDIR\BTPS.exe"
  CreateShortcut "$DESKTOP\BTPS 日志.lnk" "explorer.exe" "$APPDATA\BTPS\logs"
!macroend

!macro customUnInstall
  # 卸载时不关闭 LongPaths（其他应用可能也用）
  # 删除桌面快捷方式
  Delete "$DESKTOP\BTPS.lnk"
  Delete "$DESKTOP\BubbleTeaPOS.lnk"
  Delete "$DESKTOP\BTPS 日志.lnk"
!macroend
