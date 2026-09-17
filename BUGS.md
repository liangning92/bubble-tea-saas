# BUGS

所有 bug 必须先登记 ID 再进入修复流程。

格式：
```markdown
## BUG-XXX
Title:
Severity: P0/P1/P2/P3
Status: OPEN / IN_PROGRESS / FIXED / DEFERRED
Reproductions:
  - 步骤 1
  - 步骤 2
Expected:
Actual:
Root Cause: (修复后填写)
Changed Files: (修复后填写)
Regression Test: (修复后填写)
Commit: (修复后填写)
```

---

## 已知 Bug

> 2026-09-18 之前的历史问题需要逐一整理到本文件
> 当前状态：待整理

### 待整理项目（来自 session logs）

- [ ] sync/connect 返回 401（2026-09-04 日志）
- [ ] 登录后卡在 #/setup（2026-09-04 日志）
- [ ] 数据库每次启动被覆盖（已修复，2026-09-18）

---

## 新 Bug 登记模板

发现新 bug 时，先在下方添加记录，再进入修复流程：

```markdown
## BUG-001
Title:
Severity:
Status: OPEN
Reproductions:
  -
Expected:
Actual:
Root Cause:
Changed Files:
Regression Test:
Commit:
```
