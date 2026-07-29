---
name: github-action-001
description: GitHub Actions 构建失败 - overwrite参数无效
category: github-action
status: resolved
created: 2026-07-29
resolved: 2026-07-30
related-issues:
  - electron-publish-001
---

# GitHub Actions 构建失败 - overwrite参数无效

## 问题描述

GitHub Actions 运行 "Build Windows Executable" 失败，报错：
```
Unexpected input(s) 'overwrite', valid inputs are ['body', 'body_path', 'name', 'tag_name', 'draft', 'prerelease', 'files', 'fail_on_unmatched_files', 'repository', 'token', 'target_commitish', 'discussion_category_name', 'generate_release_notes', 'append_body']
Failed to upload release asset _micro.d.ts.map. received status code 404
```

## 影响范围

- 无法通过 GitHub Actions 自动构建 Windows exe
- Release 无法正常创建

## 根因分析

`action-gh-release@v1` 不支持 `overwrite: true` 参数，此参数只在 v2 版本支持。

## 修复方案

移除 `.github/workflows/build-windows.yml` 中的 `overwrite: true` 参数。

```yaml
# 修复前
files: |
  release/win-unpacked/**
  release/*.exe
  release/latest.yml
overwrite: true  # ❌ v1不支持

# 修复后
files: |
  release/win-unpacked/**
  release/*.exe
  release/latest.yml
```

## 修复记录

| 日期 | 修复内容 | 修复人 |
|------|----------|--------|
| 2026-07-30 | 移除 overwrite 参数 | Claude |

## 验证方式

GitHub Actions 构建成功，Release 正常创建。

## 预防措施

- 使用 action-gh-release@v2 获取最新功能支持
- 或使用 `draft: false` + 唯一 tag 避免覆盖问题
