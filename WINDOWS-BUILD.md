# Windows 构建指南 - Bubble Tea POS 离线版

## 方式一：本地 Windows 构建

### 前置要求
- Windows 10/11 x64
- Node.js 18+ ([下载](https://nodejs.org/))

### 构建步骤

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd bubble-tea-saas

# 2. 安装依赖
npm install

# 3. 构建 Windows 安装包
npm run electron:build
```

构建产物：`release/Bubble Tea POS-1.0.0-Windows-x64.exe`

### 直接运行（开发模式）
```bash
npm run electron:dev
```

---

## 方式二：GitHub Actions 云构建（推荐，无需 Windows 机器）

### 步骤
1. 把项目上传到 GitHub（公开或私有仓库）
2. 在 GitHub 仓库页面 → **Actions** → **Build Windows Executable** → **Run workflow**
3. 等待构建完成（约 10-15 分钟）
4. 下载构建产物：`release/Bubble Tea POS-1.0.0-Windows-x64.exe`

---

## 离线安装

1. 把 `.exe` 文件拷贝到 Windows 电脑
2. 双击运行安装程序
3. 选择安装目录
4. 完成安装后，从桌面快捷方式启动

---

## 硬件要求

- **打印机**：支持 ESC/POS 的 USB 热敏打印机（58mm/80mm）
  - 连接到 Windows 后，在"设备和打印机"中可见
  - 在 POS 设置中填写打印机名称（如 `XPrinter`）
  - 支持品牌：XPrinter, GPrinter, Sunmi, SPRT, Star
- **钱箱**：通过打印机 RJ11 接口连接（钱箱由打印机供电）
  - 打印小票后自动弹开
  - 或手动在设置中测试打开
- **扫码枪**：USB HID 扫码枪（无需驱动，即插即用）

---

## USB 打印机配置步骤

1. 将 USB 热敏打印机连接到 Windows 电脑
2. 安装打印机驱动（通常 Windows 自动识别）
3. 记住打印机名称（在"设备和打印机"中查看，如 `XPrinter`）
4. 启动 Bubble Tea POS
5. 进入 **设置 → 硬件设置**
6. 在"打印机名称"填写：`XPrinter`（或你的实际打印机名）
7. 点击"测试打印"确认正常
8. 以后每次现金支付完成，钱箱自动弹开

---

## 离线工作原理

1. 应用启动时，Electron 主进程启动本地 Express API 服务器
2. SQLite 数据库存储在：`%APPDATA%/Bubble Tea POS/data/dev.db`
3. 所有收银操作（点单、支付、找零）完全在本地运行
4. 联网后自动同步数据到云端（如已配置）
