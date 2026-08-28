# Disable CRC check for installer and uninstaller
CRCCheck off

!macro customInstall
  # 启用 Windows LongPaths 支持（解除260字符路径限制）
  # 这对 Electron 应用的深层目录结构至关重要
  WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Control\FileSystem" "LongPathsEnabled" 1

  # 创建桌面快捷方式：打开日志文件夹
  CreateShortcut "$DESKTOP\BTPS 日志.lnk" "explorer.exe" "$APPDATA\BubbleTeaPOS\logs"
!macroend

!macro customUnInstall
  # 卸载时不关闭 LongPaths（其他应用可能也用）
  # 删除桌面日志快捷方式
  Delete "$DESKTOP\BTPS 日志.lnk"
!macroend
