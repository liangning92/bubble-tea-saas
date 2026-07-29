---
name: white-screen-001
description: POS 白屏问题 - 硬件加速导致
category: white-screen
status: resolved
created: 2026-07-26
resolved: 2026-07-29
related-issues: []
---

# POS 白屏问题

## 问题描述

用户在 Windows 设备上运行 POS exe 时，出现白屏，无法显示任何内容。

## 影响范围

- Windows 用户无法正常使用 POS 系统
- 影响收银业务

## 根因分析

部分旧显卡/驱动与 Chromium 硬件加速不兼容，导致白屏。

## 修复方案

在 `client-pos/electron/main.ts` 中添加以下修复：

1. 禁用硬件加速
```typescript
app.disableHardwareAcceleration()
```

2. 添加 Chromium 启动参数
```typescript
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('disable-accelerated-2d-canvas')
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-dev-shm-usage')
app.commandLine.appendSwitch('disable-gpu-compositing')
```

## 修复记录

| 日期 | 修复内容 | 修复人 | Commit |
|------|----------|--------|--------|
| 2026-07-26 | 添加 disableHardwareAcceleration() | - | a808621 |
| 2026-07-26 | 恢复 Chromium 硬件兼容参数 | - | 2ac4ecb |
| 2026-07-27 | 移除 dpi-awareness switch | - | 5b3bd69 |
| 2026-07-28 | 重新编译 electron main.js | - | aeb91bf |
| 2026-07-29 | 恢复窗口模式 (windowed) | - | e293a65 |

## 验证方式

1. 在问题设备上运行 exe
2. 确认显示正常窗口而非白屏
3. 测试打印机、钱箱等功能正常

## 预防措施

- 硬件加速参数已被验证为稳定配置
- 后续修改需在 Windows 测试环境验证
