# RELEASE CHECKLIST

每次发布 Windows 安装包前必须完成的检查清单。

---

## 发布前（Pre-Release）

### 代码检查
- [ ] 没有 TODO/FIXME/BUG 注释在核心逻辑里
- [ ] 没有 console.log 在生产代码中
- [ ] 没有 hardcoded 密码/密钥
- [ ] 敏感配置通过环境变量

### Git 检查
- [ ] 所有改动已 commit（无 uncommitted changes）
- [ ] commit message 清晰描述改动
- [ ] 没有把调试分支合并到 master

### 构建检查
- [ ] 本地或 CI 构建成功
- [ ] TypeScript 编译无错误
- [ ] electron-builder 打包成功

### 功能验证（Level 2 Smoke Test）
- [ ] 启动应用正常
- [ ] 登录正常
- [ ] 点单→支付→小票流程正常
- [ ] 退款流程正常（IN_PROGRESS 功能跳过此条）

### 数据库
- [ ] schema 变更已记录在 CHANGELOG.md
- [ ] 数据库 backup 已创建

---

## 发布中（Release）

### 版本
- [ ] 版本号已更新（package.json）
- [ ] Git tag 已创建
- [ ] GitHub Release 已创建

### 产物
- [ ] NSIS 安装包存在：`BTPS-*.exe`
- [ ] 便携版存在（如需要）

---

## 发布后（Post-Release）

### 验证
- [ ] 下载安装包
- [ ] 全新目录安装
- [ ] 应用正常启动
- [ ] 核心功能可用

### 记录
- [ ] Release 信息已更新在 CHANGELOG.md
- [ ] PROJECT.md 版本号已更新
- [ ] 相关需求状态已更新（REQUIREMENTS.md）

---

## 回滚准备

如发布后发现 P0 bug：
- [ ] 立即停止推进
- [ ] 定位引入版本
- [ ] 执行 git revert 或发布补丁版本
- [ ] 更新 CHANGELOG.md
