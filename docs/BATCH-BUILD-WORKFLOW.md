# 多任务提交，统一确认后构建

## 用户操作

1. 各修改任务完成适用检查后，提交并推送代码；汇报提交 SHA、分支/PR、检查结果及是否已合并。提交本身不表示已上线。
2. 所有要包含的修改进入同一待构建分支后，用户说“开始构建”。
3. 智能体汇总上次构建到目标 SHA 的业务修改、文件、测试和未合并/未提交事项，运行无构建预检。报告哪些修改已经包含，哪些还没有包含。
4. 用户回复“确认这份清单，构建 Windows”（或指定其他组件）。智能体针对该 SHA 执行正式 CI 与构建；新提交不自动进入此次范围。
5. 构建结束汇报下载位置、版本、源 SHA、运行 ID和验证结果。正式发布/部署依照用户本次授权；仅同意构建时不自动发布。

## GitHub 配置

ci.yml、build-windows.yml、docker-publish.yml 移除 push/pull_request 触发，仅保留 workflow_dispatch；要求 reviewed_sha 和 confirmed。作业仅在 confirmed=true 且 reviewed_sha=github.sha 时执行。现有构建检查步骤与发布门禁保留。

这些配置提交到 GitHub 后才生效；启用之前普通推送仍可能触发旧工作流。不得用“提交代码但不构建”的授权触发旧的自动构建。首次安装规则可以在提交消息中使用 GitHub 支持的 [skip ci] 跳过 push/pull_request；需检查当前仓库其他触发器，若分支保护要求旧自动 CI，应相应调整 required checks，不能声称已通过。

## 汇总基准

- 分别读取 Windows、Docker 或正式发布的实际源码 SHA；若两端基准不同，分别汇总。上次成功构建和上次发布可能不同，应向用户说明选择的基准。
- 无可靠基准时明确列为待确定，不猜版本或把最近一次提交当成已发布版本。
- 使用完整 SHA，核验基准是目标祖先。先拉取已确定的 Git 对象再生成报告。
- 生成清单：`node scripts/batch-build-report.cjs --base <完整基准SHA> --target <完整目标SHA>`。输出 JSON，不运行构建、不修改 Git。工作区状态不属于目标提交内容。
- GitHub PR、其他独立 clone/worktree 的改动需额外核实；脚本不承诺自动发现所有任务或其真实完成状态。

## 预检与审批

预检包括工作区/分支检查、冲突与空白错误、受影响模块类型检查和适用回归测试、安全审查，以及数据库/打包配置的源码检查。需要生成产物的检查在批准构建后执行；packaging-validate 对陈旧 dist 的检查不能作为新 SHA 已通过的证据。失败项处理完再确认。

审批报告必须含基准、完整目标 SHA、业务变化、受影响组件、检查结果、待执行的正式检查、未纳入事项。审批以聊天中的人类确认记录为依据，脚本或其他智能体不能代替人类确认。

批准后通过 GitHub 手动工作流传入 reviewed_sha=<批准SHA>、confirmed=true，并核验运行的 head_sha 等于批准 SHA。若分支已移动，停止并重新汇总，或使用已核实的不移动 ref。正式 CI、组件构建必须针对同一 SHA；不能复用其他提交的成功结果。

GitHub 手动构建：https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
项目指令：https://learn.chatgpt.com/docs/agent-configuration/agents-md
