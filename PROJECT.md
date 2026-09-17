# PROJECT STATE

## Project
bubble-tea-saas (Bubble Tea POS)

## Type
Electron 桌面应用 + Next.js 前端 + Express API + Prisma/SQLite

## Current Status
Stabilization（稳定化阶段）

## Current Version
v2026.9.251 (2026-09-17)

## Current Goal
让 Windows 安装包可以在门店实际使用——核心流程（点单→支付→小票打印→库存扣减）稳定无 P0/P1 bug

## Currently Working On
系统性建立开发流程（PROJECT.md / BUGS.md / CHANGELOG.md 等核心文件）

## Last Completed
- v2026.9.251 构建成功 ✅
- 厨房打印 sendKitchenOrder 已实现（main.ts + preload）
- 数据库启动覆盖问题已修复（只在首次安装时初始化）
- electron-pos-printer 静默失败已加警告对话框
- WebView2 URL 已更新

## Known Critical Bugs (P0/P1)

| Bug ID | 描述 | 状态 |
|---|---|---|
| — | 无已登记的 P0 bug | — |

> 发现新 bug 必须先登记到 BUGS.md，再进入修复流程

## Recently Changed
- 厨房打印（sendKitchenOrder IPC bridge）
- 数据库初始化逻辑（不再每次启动覆盖）
- printer 加载警告
- WebView2 URL

## Areas At Risk（高风险区域）
- 订单核心流程（order → payment → inventory → receipt）
- 离线同步机制（sync/connect 曾返回 401）
- 数据库迁移

## Next Action
1. 建立完整 BUGS.md（整理历史 bug）
2. 建立 REQUIREMENTS.md（整理功能状态）
3. 建立 TEST_PLAN.md（人工测试清单）
4. 执行第一次 POS smoke test

## Important Rules
- 不允许直接修改 production data
- 修改数据库 schema 前必须备份
- Bug 修复必须先登记 BUG-ID
- 修改前必须回答 PRE-CHANGE CHECK
- 修改后必须回答 POST-CHANGE CHECK
- 单次 bug 修复改动不许超过 5 个文件

## Build Info
- Windows 构建：GitHub Actions `Build Windows Executable`
- 最新成功构建：v2026.9.251（2026-09-17）
- 构建状态：https://github.com/liangning92/bubble-tea-saas/actions

## Tech Stack
- Frontend: Next.js (client-pos / client-admin)
- Desktop: Electron 33.4.11
- Backend: Express + Prisma + SQLite
- Build: electron-builder + NSIS installer
- Ports: Server 7072, POS 6063, Admin 5173
