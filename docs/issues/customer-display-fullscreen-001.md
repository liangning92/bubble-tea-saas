# 副屏上下留白

现象：副屏已设置 fullscreen，但上下仍出现空缺。

根因：CustomerDisplayCanvas 将 1280×720 固定画布按 Math.min 等比缩放并居中；1024×768 下内容只有 1024×576，上下各留 96。窗口还使用 workArea 并保留原生边框。

学习依据：Electron Display 文档区分 bounds（完整屏幕）和 workArea（工作区），screen 的 display-metrics-changed 通知 bounds/scaleFactor/rotation 变化。
https://www.electronjs.org/docs/latest/api/structures/display
https://www.electronjs.org/docs/latest/api/screen

修复：维持统一等比缩放，将画布未填满的维度扩展至视口边缘，布局区域随画布伸展，文字、二维码和图片不拉伸。窗口使用完整 bounds、无边框；显示器参数变化时重新设置边界和全屏。管理端 16:9 预览保持原坐标。

验证：真实顾客页面与预览检查，覆盖 16:9、4:3、竖屏、超宽屏、DPI 和实时缩放；Electron 类型检查。真实 Windows 双屏验收需新安装包。
