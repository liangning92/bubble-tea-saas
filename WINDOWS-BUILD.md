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

- **打印机**：支持 ESC/POS 的热敏打印机（58mm/80mm）
  - 配置 IP 地址（如 `192.168.1.100:9100`）
  - 大部分品牌：XPrinter, GPrinter, Sunmi, SPRT 均支持
- **钱箱**：连接打印机的钱箱接口（RJ11/RJ12）
  - 自动通过打印机指令弹出
- **扫码枪**：USB HID 扫码枪（无需驱动，即插即用）

---

## 离线工作原理

1. 应用启动时，Electron 主进程启动本地 Express API 服务器
2. SQLite 数据库存储在：`%APPDATA%/Bubble Tea POS/data/dev.db`
3. 所有收银操作（点单、支付、找零）完全在本地运行
4. 联网后自动同步数据到云端（如已配置）

---

## 配置文件位置

启动后，可在管理后台设置：
- 打印机 IP/端口
- 钱箱自动弹出开关
- 店铺信息
- 支付方式配置
