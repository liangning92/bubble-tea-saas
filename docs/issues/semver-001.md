---
name: semver-001
description: 版本号格式不规范 - semver验证失败
category: semver
status: resolved
created: 2026-07-27
resolved: 2026-07-28
related-issues:
  - electron-updater-001
---

# 版本号格式不规范

## 问题描述

electron-updater 要求 3 段式 semver 版本号 (如 `2026.7.150`)，但构建脚本生成的版本号格式有问题：
- 月份出现前导零：`2026.07.144`
- 月份拼写错误：`2026.July.27.145`

## 影响范围

- electron-updater 无法正确解析版本号
- 可能导致更新功能失效

## 根因分析

PowerShell 版本计算问题：
1. `[int](Get-Date -Format 'MM')` 在某些 runner 上可能产生前导零
2. 字符串拼接时月份拼写错误

## 修复方案

修复 `.github/workflows/build-windows.yml` 中的版本计算逻辑：

```powershell
# 修复前
$version = "$year.$month.$runNum"  # $month 可能是 "07" 或 "July"

# 修复后
$monthNum = [int](Get-Date -Format 'MM')
$version = "$year.$monthNum.$runNum"
```

## 修复记录

| 日期 | 修复内容 | 修复人 | Commit |
|------|----------|--------|--------|
| 2026-07-27 | 移除月份前导零 | - | 67d637f |
| 2026-07-27 | 修复月份格式 `2026.July` | - | 2682ae6 |
| 2026-07-28 | 使用 [int] 转换月份 | - | 8506be5 |

## 验证方式

检查 GitHub release 中的版本号格式是否为 `2026.7.xxx`（无前导零）。

## 预防措施

- 版本号使用纯数字格式
- CI 中添加版本号格式校验
