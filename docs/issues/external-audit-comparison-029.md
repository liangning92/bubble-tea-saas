# 外部排查报告与当前代码对照（2026-10-08）

检查对象：当前 source 仓库及实际部署环境；线上健康返回版本 2026.10.313、来源 7487fbc，GitHub 已发布 v2026.10.313。本文区分旧入口、当前实现、实际发布及未经实机测量的推断。

| 报告项 | 当前结论 | 证据和范围 |
|---|---|---|
| npm test 全部失败 | 旧默认入口确实需要整理，“项目全部测试失败 / CI 无法验证”不成立 | server/package.json 默认 jest 加载 __tests__/setup.ts 的全库清理。没有隔离数据库时应被拦截，不应删除安全保护。本次独立 jest.audit.config.cjs 为 25 套件、173 项通过，CI 已使用该入口与隔离 SQLite/PostgreSQL HTTP 回归。Jest 本身默认设置 NODE_ENV=test，主要问题是没有专用数据库及不同测试入口，不能仅归因于脚本未设 NODE_ENV。 |
| 四段版本与更新冲突 | 旧本地脚本存在；不能据此断言线上 313 更新失效 | scripts/update-version.js 生成四段、根 package.json 为 2026.10.02.1748，semver.valid 返回 null。client-pos 为合法 2026.9.254；线上已发布 v2026.10.313。build-windows.yml 会生成三段版本并同步根/POS 包。需统一旧本地构建入口；现有正式 Windows 构建已规避旧脚本。 |
| packaging-check.sh 语法错误 | 已复现 | grep -c 不匹配时自身输出 0，又执行 echo 0，形成两行；脚本整数比较失败。仅搜索 files/asarUnpack 不能判定 Electron 依赖缺失：package dependencies 已声明 electron-log/updater，electron-builder 还会收集运行依赖。不能把检查脚本误报当作实际安装包缺模块的证据。 |
| 本地缺 SQLite 切换 | 当前代码不支持报告结论 | 根 electron:build 已调用 db:generate:sqlite，指向 schema.sqlite.prisma；两份 Prisma schema 目前仅 provider 不同。正式 Windows 流程使用当前模型生成空模板、升级辅助程序及校验，旧本地入口仍需统一到该流程，但并非“没有 SQLite 生成步骤”。 |
| 离线订单没有幂等 | 已修复，报告描述过时 | OrderReplayService 校验请求指纹和持久化回执，OrderService.createOrder、单笔及 bulk-sync 都先处理重试。已覆盖丢失回包、断网重试、同号不同内容、并发及库存只扣一次。不能只用“同店同号直接返回”替代指纹校验，否则改金额/商品也会被误认为成功。 |
| 云端 /sync/full 执行 PRAGMA | 仍存在，应加数据库模式限制 | sync.ts /full 在有效一次性票据、云端数据完整且门店校验通过后，会执行 PRAGMA foreign_keys OFF/ON，未检查 provider；PostgreSQL 不支持这些指令。并非任意未登录请求都会触发，现有票据与店铺保护仍然有效。 |
| Windows 每次打印启动 PowerShell / Add-Type | 实现存在，性能数值未实测 | main.ts sendRawBytesToWindowsPrinter 每次启动 powershell.exe 并加载 C#。报告的 1.5–3 秒不能当作本店测量值；需门店 Windows 实机计时，预编译辅助程序须验证架构、驱动及包内调用后再替换。 |
| 前端没有路由拆包 | 存在 | Admin/POS App.tsx 仍主要使用直接页面导入，构建有大 chunk 告警。报告中的文件 hash 和体积属于当时产物，需以当前构建输出为准。影响首屏下载/解析；不能据此断言页面保存失败。 |
| 部署 .env 未跟踪即暴露 | 没有发现已提交凭据证据；部署工作区有漂移 | source 和实际部署工作区的 git check-ignore 都显示 .gitignore 的 .env 规则已匹配深层部署 .env，git ls-files 未发现该文件。实际部署工作区 docker-compose.yml、scripts/backup-db.sh 有本地修改，需整理运维来源。文件存在且未跟踪不等于已泄露，本次未输出密码或 JWT 密钥。 |

## 建议优先顺序

1. 云端 SQLite-only 同步接口明确拒绝 PostgreSQL；统一安全测试、版本及本地桌面构建入口。
2. 修复打包检查脚本，但最终以实际包内模块和 Windows 启动验证为准。
3. 实机测量打印延迟，再替换打印辅助程序；路由拆包作为加载性能改进。
4. 保留订单请求指纹、回执与数据库安全保护，不按报告的简化示例倒退实现。

报告标题提到 BOM，但正文未给具体缺陷、复现数据或断言，不能据此判定 BOM 全部正确或全部有问题。业务交易验证与实机验收仍分别记录，不把编译通过当作全部业务通过。
