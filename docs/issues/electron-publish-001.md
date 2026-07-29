---
name: electron-publish-001
description: electron-builder 与 GitHub Release 发布流程冲突
category: electron
status: resolved
created: 2026-07-24
resolved: 2026-07-28
related-issues:
  - github-action-001
---

# electron-builder 与 GitHub Release 发布流程冲突

## 问题描述

多个发布流程互相冲突：
1. `electron-builder` 自带的 `--publish` 功能
2. GitHub Actions 的 `action-gh-release`
3. `softprops/action-gh-release` action

导致：
- 重复创建 Release
- 上传文件 404 错误
- 版本覆盖失败

## 影响范围

- GitHub Actions 构建失败
- Release 无法正常创建
- 版本号管理混乱

## 根因分析

三套发布系统同时启用，互相冲突：
1. `electron-builder` 的 `--publish always` 会自动上传
2. `action-gh-release` 也会创建 Release
3. 两者竞争导致 404

## 修复方案

分离发布流程：
1. electron-builder 使用 `--publish never` 禁用自动发布
2. 只使用 `action-gh-release` 创建 Release
3. 指定明确的上传文件列表

```yaml
# Build Electron 步骤
- name: Build Electron
  run: npx electron-builder --config electron-builder.json --win --publish never

# Create Release 步骤
- name: Create Release
  uses: softprops/action-gh-release@v1
  with:
    tag_name: v${{ steps.version.outputs.VERSION }}
    files: |
      release/win-unpacked/**
      release/*.exe
      release/latest.yml
```

## 修复记录

| 日期 | 修复内容 | 修复人 | Commit |
|------|----------|--------|--------|
| 2026-07-24 | 添加 --publish never | - | 00afa2f |
| 2026-07-24 | 添加 publish config for latest.yml | - | 8747010 |
| 2026-07-24 | 移除 --publish never | - | 887aa71 |
| 2026-07-24 | 允许 electron-builder publish 失败 | - | 842458b |
| 2026-07-25 | 添加 GH_TOKEN env mapping | - | 92793e6 |
| 2026-07-25 | 只使用 electron-builder 发布 | - | 3cea060 |
| 2026-07-25 | 设置 releaseType 为 release | - | 92b1209 |
| 2026-07-25 | 在构建前创建 git tag | - | 3917e24 |
| 2026-07-25 | 推送 tags 到远程 | - | 0f27d65 |
| 2026-07-26 | 移除 releaseType，使用默认 draft | - | 1c3b75f |
| 2026-07-26 | 使用 action-gh-release 上传 | - | 6f265b1 |
| 2026-07-27 | 移除 electron-builder publish config | - | 7d977df |
| 2026-07-28 | 添加 --publish never | - | c843360 |
| 2026-07-28 | 添加 latest.yml 到上传文件 | - | 3fb6868 |

## 验证方式

GitHub Actions 构建成功，Release 包含：
- `release/win-unpacked/` 目录
- `.exe` 文件
- `latest.yml` 文件

## 预防措施

- 只使用一套发布流程
- electron-builder 禁用自动发布
- Release 创建统一使用 action-gh-release
