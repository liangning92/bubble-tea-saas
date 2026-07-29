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

| # | 原因 | 解决方案 | 状态 |
|---|------|----------|------|
| 1 | 硬件加速 | `disableHardwareAcceleration()` | ✅ 已有 |
| 2 | 文件路径错误 | `app.getAppPath() + 'client-pos'` | ✅ 已修复 |
| 3 | ErrorBoundary `window.location.href` | 改为 `/#/` | ✅ 已修复 |
| 4 | ConnectionManager `window.location.origin` | 添加 file:// 协议处理 | ✅ 已修复 |
| 5 | file:// 协议问题 | 使用 `loadFile()` | ✅ 已使用 |
| 6 | React 渲染错误 | ErrorBoundary + 诊断窗口 | ✅ 已添加 |
| 7 | WebView2 缺失 | 用户需安装 | ⚠️ 待验证 |
| 8 | API 请求失败 | CLOUD_API_URL | ✅ 已配置 |

## 已修复的问题详情

### 1. getResourcePath() 文件路径修复
**文件：** `client-pos/electron/main.ts`
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

### 2. ErrorBoundary 导航修复
**文件：** `client-pos/src/components/ErrorBoundary.tsx`
```typescript
// 修复前
window.location.href = '/'

// 修复后
window.location.href = '/#/'
```

### 3. ConnectionManager API URL 修复
**文件：** `client-pos/src/services/ConnectionManager.ts`
```typescript
// 修复前
const baseUrl = this.currentUrl.startsWith('http') ? this.currentUrl : window.location.origin

// 修复后
let baseUrl: string
if (this.currentUrl.startsWith('http')) {
  baseUrl = this.currentUrl
} else if (window.location.origin && window.location.origin.startsWith('http')) {
  baseUrl = window.location.origin
} else {
  // file:// protocol - 使用配置的 API URL
  baseUrl = getApiUrl().replace(/\/api$/, '')
}
```

### 4. 诊断窗口
**文件：** `client-pos/electron/main.ts`
- 打开诊断窗口显示路径信息
- 加载成功则关闭诊断窗口
- 加载失败则保持诊断窗口打开

## electron-builder 配置

```json
{
  "asar": false,
  "files": [
    "client-pos/dist/**/*",
    "client-pos/dist-electron/**/*"
  ],
  "extraMetadata": {
    "main": "client-pos/dist-electron/electron/main.js"
  }
}
```

## 待验证项

- [ ] 构建后 `app.getAppPath()` 的实际返回值
- [ ] 构建后 `index.html` 是否存在于正确位置
- [ ] 诊断窗口是否正常显示
- [ ] API 请求是否正常
- [ ] 渲染是否成功

## 学习资源

- [Electron app.getPath() 路径含义](https://blog.csdn.net/weixin_41538642/article/details/137696613)
- [Electron 开发环境与生产环境路径配置](https://blog.csdn.net/weixin_26934905/article/details/159949834)
- [electron-builder 常见问题解决](https://blog.csdn.net/fghyibib/article/details/145197969)
- [Adamant-im 白屏修复 PR](https://github.com/Adamant-im/adamant-im/pull/460)
- [Electron file:// 协议问题](https://blog.csdn.net/youyudexiaowangzi/article/details/113935045)
