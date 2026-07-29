---
name: github-action-002
description: GitHub Release 上传 win-unpacked 目录导致超时/404
category: github-action
status: resolved
created: 2026-07-30
resolved: 2026-07-30
related-issues:
  - github-action-001
---

# GitHub Release 上传 win-unpacked 目录导致超时/404

## 问题描述

GitHub Actions 构建成功，但在创建 Release 时失败：
```
Failed to upload release asset _arx.js. received status code 404
```

## 影响范围

- Release 无法正常创建
- 虽然 exe 构建成功，但无法发布

## 根因分析

`release/win-unpacked/**` 包含数千个小文件（Chromium 资源、.pak 文件、源映射文件等），导致：
1. 上传时间过长，超时
2. 文件数量超过 GitHub API 限制

## 修复方案

移除 `win-unpacked` 目录，只上传必要文件：

```yaml
# 修复前
files: |
  release/win-unpacked/**
  release/*.exe
  release/latest.yml

# 修复后
files: |
  release/*.exe
  release/latest.yml
```

**原因：** portable exe 是自包含的，无需上传 unpacked 目录。

## 修复记录

| 日期 | 修复内容 | 修复人 | Commit |
|------|----------|--------|--------|
| 2026-07-30 | 移除 win-unpacked 从上传文件列表 | Claude | c57eaed |

## 验证方式

1. GitHub Actions 构建成功
2. Release 创建成功
3. Release 包含 `BubbleTeaPOS.exe` 和 `latest.yml`

## 预防措施

- 只上传必要的发布文件
- 不要上传完整的 unpacked 目录
