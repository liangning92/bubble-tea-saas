# 当前正式部署与修复版发布

正式环境为本机 Docker Desktop + Cloudflare Tunnel。API、管理、POS网页、员工端的入口为 api/admin/pos/staff.aicube.online。正式数据在 PostgreSQL 卷 bubble-tea-saas_postgres_data；上传媒体在 uploads 卷。Windows POS 使用本地 SQLite 与 IndexedDB，不得用 SQLite 文件备份代替正式 PostgreSQL。

## 发布顺序

1. 本机镜像构建必须带准确源码 SHA 标签，前端 Dockerfile 使用仓库根目录上下文；API使用 server 上下文。不得以 latest 作为已验证版本。
2. 执行 scripts/backup-db.sh，核对 dump 与媒体压缩包校验值，验证隔离恢复。备份目录权限仅操作者可读。
3. 在隔离恢复库演练 docs/COMPREHENSIVE-REMEDIATION-MIGRATION.sql；校验全部原表原字段历史数据一致。正式迁移仅添加字段、表、索引和库存流水触发器；缺失历史税额保持 NULL。
4. 正式服务暂停写入后执行同一迁移，保留旧镜像及原 Compose；迁移成功再启动修复版应用。生产验收不得创建测试交易。
5. 健康接口应为200/ok，database和Redis均ok，sourceSha等于发布源码；校验公网前端和未登录接口边界。
6. 构建 Windows 安装包，通过普通 CI、真实 NSIS 旧库升级、安装拒绝/回滚、启动与离线测试。发布流程再次读取正式后端 SHA/能力，通过后才更新 latest.yml。

## 本机现有 Compose 链

保留原生产项目 docker-compose.yml，按顺序叠加以下已部署配置：

- 2026-10-06/task-2/api-hotfix-deployment/compose.hotfix.yml
- 2026-10-06/task-2/pos-hotfix-deployment/compose.pos-hotfix.yml
- 2026-10-06/task-2/bubble-tea-training/docs/training/deployed-20261006/compose.training.yml
- 本次修复部署的 compose.remediation.yml

不得只启动底层 Compose，因为它会丢失已部署修复和培训版本。最终 override 明确固定四个新镜像，禁用 Watchtower 自动替换，保留原数据卷、上传卷、JWT 和域名；DB/Redis端口绑定127.0.0.1。数据库凭证仅保存在权限600的主机环境文件，不提交到仓库。

## 回滚及限制

启动失败优先恢复上一组镜像和配置，不覆盖迁移后的业务数据。新增字段和表可供旧版本忽略；库存流水机制保留。灾难恢复必须先停止写入，再将已验证备份恢复到新的隔离卷进行检查，禁止直接覆盖正在使用的正式数据库。

定时备份任务 com.bubbletea.backup 每日02:00执行，保留最近30份已验证数据库及媒体文件。异地复制和备用主机尚需实际目标。Xendit 的 API_BASE_URL、回调令牌及门店商户API密钥都齐备后才可开通动态QRIS，付款截图只作证据，不能冒充平台到账。外卖三平台当前仅预留接口。
