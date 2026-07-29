# Issue Tracker 问题追踪系统

## 📋 问题索引

### 按时间倒序排列

| 日期 | Issue ID | 问题名称 | 状态 | 修复方式 |
|------|----------|----------|------|----------|
| 2026-07-30 | [white-screen-002](white-screen-002.md) | 白屏问题完整分析 - 多种原因 | 🔄 调查中 | 学习完成，待验证 |
| 2026-07-30 | [github-action-002](github-action-002.md) | Release 上传 win-unpacked 超时/404 | ✅ 已修复 | 移除 win-unpacked，只上传 exe + latest.yml |
| 2026-07-29 | [github-action-001](github-action-001.md) | GitHub Actions 构建失败 - overwrite参数无效 | ✅ 已修复 | 移除 action-gh-release@v1 的 overwrite 参数 |
| 2026-07-26 | [white-screen-001](white-screen-001.md) | POS 白屏问题 | ✅ 已修复 | 禁用硬件加速 + Chromium 参数调整 |
| 2026-07-27 | [semver-001](semver-001.md) | 版本号格式不规范 | ✅ 已修复 | 使用3段式 semver，移除月份前导零 |
| 2026-07-24 | [electron-publish-001](electron-publish-001.md) | electron-builder 与 GitHub Release 冲突 | ✅ 已修复 | 分离发布流程，electron-builder 使用 --publish never |

---

## 📊 统计

| 状态 | 数量 |
|------|------|
| 已修复 | 5 |
| 进行中 | 1 |
| 待处理 | 0 |
| **总计** | **6** |

---

## 📁 Issue 文件结构

```
docs/issues/
├── INDEX.md              # 本文件 - 问题索引
├── ISSUE_TEMPLATE.md     # 新问题模板
├── github-action-001.md  # GitHub Actions 问题
├── white-screen-001.md   # 白屏问题
├── semver-001.md         # 版本号问题
└── electron-publish-001.md
```

---

## 🏷️ 按类别统计

| 类别 | 数量 | Issue IDs |
|------|------|-----------|
| github-action | 2 | github-action-001, github-action-002 |
| white-screen | 2 | white-screen-001, white-screen-002 |
| semver | 1 | semver-001 |
| electron | 1 | electron-publish-001 |

---

## ➕ 添加新问题的规则

### 触发条件
- 发现新 Bug 或技术问题
- GitHub Actions 构建失败
- 用户报告的问题
- 任何需要修复的技术债务

### 添加步骤
1. 复制 `ISSUE_TEMPLATE.md` 创建新文件
2. 填入问题名称、日期、描述
3. 更新本索引表的对应位置（按日期排序）
4. 修复后更新状态和修复方式

### 命名规范
- 文件名: `{category}-{number}.md`
- Category: `github-action`, `white-screen`, `semver`, `electron`, `printer`, `database` 等
- Number: 4位数字，从 `0001` 开始

---

## 🔍 查询问题

### 按类别查询
```bash
ls docs/issues/ | grep <category>
```

### 查看详情
```bash
cat docs/issues/<issue-id>.md
```

---

## 📝 更新规则

| 操作 | 谁来做 | 何时做 |
|------|--------|--------|
| 添加新 Issue | 发现问题的开发者 | 立即 |
| 更新修复方式 | 修复问题的开发者 | 修复完成后 |
| 更新状态 | 修复问题的开发者 | 修复完成后 |
| 重新打开 Issue | 同一开发者 | 问题复发时 |

---

## ⚠️ 新问题预防清单

在提交代码前检查：

- [ ] GitHub Actions 构建成功
- [ ] 版本号格式正确 (semver)
- [ ] electron-builder 配置正确
- [ ] 没有引入新的冲突
