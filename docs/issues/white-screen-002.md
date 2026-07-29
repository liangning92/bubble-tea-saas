---
name: white-screen-002
description: 白屏问题完整分析 - 多种可能原因和解决方案
category: white-screen
status: in-progress
created: 2026-07-30
resolved:
related-issues:
  - white-screen-001
---

# 白屏问题完整分析

## 问题描述

用户报告 v2026.7.153 版本依然白屏，需要全面分析所有可能原因。

## 白屏原因完整列表

| # | 原因 | 症状 | 解决方案 | 状态 |
|---|------|------|----------|------|
| 1 | 硬件加速 | 旧显卡/驱动不兼容 | `disableHardwareAcceleration()` | ✅ 已有 |
| 2 | 文件路径错误 | index.html 找不到 | `app.getAppPath() + 'client-pos'` | ✅ 刚修复 |
| 3 | file:// 协议问题 | Electron 4+ 安全策略阻止 | 使用 `loadFile()` 或自定义协议 | ⚠️ 待验证 |
| 4 | partition 设置 | 隔离 session 导致协议失败 | 移除 partition | ⚠️ 待检查 |
| 5 | WebView2 缺失 | Windows 缺少 WebView2 | 安装 WebView2 | ⚠️ 待验证 |
| 6 | 渲染进程崩溃 | JS 错误导致崩溃 | 添加 DevTools 诊断 | ⚠️ 待添加 |
| 7 | asar 打包问题 | 路径解析失败 | 检查 `app.getAppPath()` 返回值 | ⚠️ 待验证 |

## 路径配置关键点

### Electron 路径属性对照表

| 属性 | 开发环境 | 打包环境 (asar=false) | 打包环境 (asar=true) |
|------|---------|----------------------|---------------------|
| `app.getAppPath()` | 项目目录 | `resources/app/` | `resources/app.asar` |
| `process.resourcesPath` | node_modules/electron/dist/Resources | `resources/` | `resources/` |
| `__dirname` | dist-electron/electron | 指向 asar 内目录 | 指向 asar 内目录 |

### electron-builder files 配置与路径对应关系

```json
{
  "files": [
    "client-pos/dist/**/*",      // → resources/app/client-pos/dist/
    "client-pos/dist-electron/**/*"  // → resources/app/client-pos/dist-electron/
  ]
}
```

### getResourcePath() 修复

```typescript
function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    // 修复：需要加 'client-pos' 前缀
    return path.join(app.getAppPath(), 'client-pos', relativePath)
  } else {
    return path.join(__dirname, '..', '..', relativePath)
  }
}
```

## file:// 协议问题分析

### 问题原因
Electron 4.x+ 强化了安全策略，`file://` 协议默认被阻止。

### 解决方案
使用 `mainWindow.loadFile()` 而不是 `loadURL('file://...')`。

当前代码已使用 `loadFile()`：
```typescript
mainWindow.loadFile(indexPath)
```

这应该是正确的，但需要确认 `indexPath` 是否正确。

## 待验证项

- [ ] `app.getAppPath()` 在打包后的实际返回值
- [ ] `index.html` 是否存在于正确位置
- [ ] `loadFile()` 是否正常工作
- [ ] 是否有其他 JS 错误

## 学习资源

- [Electron app.getPath() 路径含义](https://blog.csdn.net/weixin_41538642/article/details/137696613)
- [Electron 开发环境与生产环境路径配置](https://blog.csdn.net/weixin_26934905/article/details/159949834)
- [electron-builder 常见问题解决](https://blog.csdn.net/fghyibib/article/details/145197969)
- [Adamant-im 白屏修复 PR](https://github.com/Adamant-im/adamant-im/pull/460)
- [Electron file:// 协议问题](https://blog.csdn.net/youyudexiaowangzi/article/details/113935045)
