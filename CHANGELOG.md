# CHANGELOG

格式说明：
- 每条记录包含：日期、变更内容、影响分析、验证方式、commit hash
- 这是"为什么变"，不是"变了什么"（Git log 负责后者）
- 每条变更关联 BUG-ID 或 REQUIREMENTS-ID

---

## 2026-09-18

### BUG-012
**修复**：厨房打印 `sendKitchenOrder` 从缺失到完整实现

Changed:
- `client-pos/electron/main.ts` — 新增 ipcMain handler、generateKitchenText()
- `client-pos/electron/preload.ts` — 暴露 sendKitchenOrder

Potential Impact:
- POS 厨房打印机配置

Validation:
- 配置网络厨房打印机 → 完成订单 → 观察打印机

Commit: 2420b45

---

### BUG-011
**修复**：数据库每次启动被 seed.db 覆盖 → 改为仅首次安装时初始化

Changed:
- `client-pos/electron/main.ts` — 数据库初始化逻辑

Potential Impact:
- 数据丢失风险（用户数据不再被覆盖）

Validation:
- 启动应用 → 创建订单 → 关闭 → 重启 → 订单仍存在

Commit: 2420b45

---

### BUG-010
**修复**：electron-pos-printer 加载失败时静默忽略 → 显示警告对话框

Changed:
- `client-pos/electron/main.ts` — printerLoadFailed 标志 + dialog.showMessageBox

Potential Impact:
- 打印功能不可用时用户能及时知道

Validation:
- 模拟 printer 模块加载失败 → 观察警告对话框

Commit: 2420b45

---

### BUG-009
**修复**：WebView2 URL 过期 → 更新为当前 URL

Changed:
- `client-pos/electron/main.ts` — URL 更新

Validation:
- 启动时 WebView2 不可用 → 观察链接是否为新 URL

Commit: 552fb02

---

### BUG-008
**修复**：generateKitchenText typo — `itemremark` → `item.remark`

Changed:
- `client-pos/electron/main.ts`

Validation:
- TypeScript 编译通过

Commit: 552fb02

---

## 2026-09-17

### SYS-005
**构建**：v2026.9.251 构建成功，Windows 安装包可用

Changed:
- 完整项目打包

Validation:
- GitHub Actions 构建成功

Release: v2026.9.251

---

## 2026-09-15

### FEAT-007
**功能**：交接班现金对账

Changed:
- POS 交接班逻辑

Validation:
- 班次切换正常，现金计数正确

---

### FEAT-006
**功能**：费用管理 Cashier 权限

Changed:
- 费用模块权限控制

Validation:
- Cashier 角色可正常使用费用功能
