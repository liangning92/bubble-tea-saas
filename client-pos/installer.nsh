# Reject before app shutdown/uninstall/file replacement; no real DB writes.
!macro BTPS_RejectExistingUpgrade
  ReadRegStr $R8 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $R9 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R8 != ""
  ${OrIf} $R9 != ""
  ${OrIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${OrIf} ${FileExists} "$INSTDIR\${APP_FILENAME}\${APP_EXECUTABLE_FILENAME}"
  ${OrIf} ${FileExists} "$APPDATA\${PRODUCT_NAME}\data\dev.db"
  ${OrIf} ${FileExists} "$APPDATA\bubble-tea-saas\data\dev.db"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\${PRODUCT_NAME}\data\dev.db"
  ${OrIf} ${FileExists} "$LOCALAPPDATA\bubble-tea-saas\data\dev.db"
    MessageBox MB_OK|MB_ICONSTOP "Existing POS installation or data detected. This candidate is for fresh test installations. Your current version is preserved; wait for upgrade clearance.$\r$\n$\r$\n已有收银版本或数据。本候选仅用于全新测试安装，原版本将保留，请等待升级确认。$\r$\n$\r$\nInstalasi atau data POS sudah ada. Kandidat ini hanya untuk instalasi uji baru. Versi saat ini dipertahankan; tunggu persetujuan peningkatan." /SD IDOK
    SetErrorLevel 73
    Quit
  ${EndIf}
!macroend

!macro customInit
  !insertmacro BTPS_RejectExistingUpgrade
!macroend

!macro customPageAfterChangeDir
  Page custom BTPS_CheckChosenDirectory
  Function BTPS_CheckChosenDirectory
    !insertmacro BTPS_RejectExistingUpgrade
    # Skip this page when the selected directory is safe.
    Abort
  FunctionEnd
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
