# Disable CRC check for installer and uninstaller
CRCCheck off

!macro customInstall
  # 创建桌面快捷方式：打开日志文件夹
  # 使用 explorer.exe 打开日志目录
  CreateShortcut "$DESKTOP\BubbleTeaPOS 日志.lnk" "explorer.exe" "$APPDATA\BubbleTeaPOS\logs"
!macroend

!macro customUnInstall
  # 卸载时删除日志快捷方式
  Delete "$DESKTOP\BubbleTeaPOS 日志.lnk"
!macroend
