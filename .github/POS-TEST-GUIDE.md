# BubbleTea POS 测试指南

## 测试环境

### 本地开发测试
```bash
cd ~/Desktop/Claude_Work/bubble-tea-saas

# 后端 (port 3000)
cd server && npm run dev

# Admin (port 5173)
cd client-admin && npm run dev

# POS 开发模式 (port 6063)
cd client-pos && npm run dev
```

### Windows CI/CD 测试
- GitHub Actions Windows Runner
- Windows Server 2022
- Node.js 20
- Playwright + Chromium

---

## 测试清单

### 1. 构建测试
- [ ] `npm run build` 成功
- [ ] `npm run build:electron:main` 成功
- [ ] `npx electron-builder --win portable` 成功
- [ ] `npx electron-builder --win nsis` 成功
- [ ] exe 文件生成

### 2. 文件结构测试
```
win-unpacked/
├── BubbleTeaPOS.exe          ✓ 入口文件存在
├── dist/
│   ├── index.html           ✓ HTML 存在
│   └── assets/              ✓ 资源文件存在
├── dist-electron/
│   └── electron/
│       ├── main.js         ✓ 主进程存在
│       └── preload.js       ✓ 预加载存在
└── resources/              ✓ 资源目录存在
```

### 3. 启动测试
- [ ] exe 启动不崩溃
- [ ] 无 JS/SyntaxError 错误
- [ ] 无 "Module not found" 错误
- [ ] 无 "Named export" 错误
- [ ] DevTools 端口响应 (localhost:9222)
- [ ] 窗口正常显示

### 4. 功能测试 (Demo 模式)
- [ ] 产品列表显示
- [ ] 产品分类切换
- [ ] 添加产品到购物车
- [ ] 修改数量
- [ ] 删除购物车项目
- [ ] 清空购物车
- [ ] 结算页面加载
- [ ] 支付方式选择

### 5. 离线测试
- [ ] 断开网络后 app 仍可启动
- [ ] Demo 产品显示
- [ ] 离线订单保存

### 6. 打印测试
- [ ] 小票打印功能
- [ ] 钱箱打开

---

## 测试路径

### 开发环境路径
```
http://localhost:6063           # POS 首页
http://localhost:6063/settings   # 设置页面
http://localhost:6063/history   # 历史订单
http://localhost:9222          # DevTools
```

### 生产环境路径 (exe 内)
```
file:///C:/Users/.../dist/index.html  # 主窗口
file:///C:/Users/.../dist/index.html#/customer-display  # 副屏
```

---

## CI/CD 测试流程

```
push/master
    ↓
test-windows (构建 + 文件检查 + 启动测试)
    ↓
e2e-test (Playwright 自动化测试)
    ↓
build (NSIS + Portable 打包)
    ↓
create-release (发布)
```

---

## 常见错误

### ERR_FILE_NOT_FOUND
- 原因: HTML/JS 路径错误
- 检查: main.ts 的 getResourcePath()

### Module not found
- 原因: CommonJS/ESM 混用
- 检查: package.json "type" 和 tsconfig

### WebView2 Error
- 原因: 缺少 WebView2 Runtime
- 解决: 安装 Edge WebView2

### GPU Process Crash
- 原因: 显卡驱动问题
- 解决: app.disableHardwareAcceleration()

### white screen
- 原因: 渲染进程失败
- 解决: F12 看 Console 错误

---

## F12 开发者工具检查

1. 运行 exe
2. 按 F12 打开开发者工具
3. 检查 Console:
   - 红色错误 = JS 错误
   - Network: 请求失败状态
4. 检查 Sources:
   - main.js 加载成功
   - preload.js 加载成功
5. 检查 Application:
   - IndexedDB 数据
   - LocalStorage 配置
