# Hermes 原生执行与对话隔离候选

当前状态：本地候选，未启用生产，不能作为“完整原生能力已上线”的验收记录。

## 已实现

- 一段实际对话对应一个账户/权限/受众命名空间；不同对话默认不共享私有原生记忆。任务变更不会丢失同一对话的长期记忆。权限或受众变化后切换命名空间。
- 每轮请求绑定原始消息 ID、序号和独立执行 ID；回复使用该执行记录，不查共享的“当前对话”指针。
- 实际 `AIAgent` 加载原生技能、记忆和可用工具。门店业务工具继续在后端事务内执行实际账户和门店权限检查。
- `delegate_task` 使用实际 Hermes 子任务，每个子任务独立 trace/version/provider receipt，不能更换门店、受众、模型或凭据；产物只回父任务。
- Gateway 的单次执行会等待原生后台 worker 的真实结果，然后交父 Agent 汇总。这不是官方持久交互 Gateway 的跨轮后台续聊。
- 原生工具结果和业务操作回执分开，子任务结果不等于业务独立验收。
- macOS 每个命名空间有 OS 文件沙箱；模型进度文字与 RPC 文件描述符分离，多个线程完整串行交换一对 RPC 帧和回执。
- 原生模型请求固定到既有订阅的执行专用 relay；没有付费兜底。网关同时只运行一个根执行，该执行的父子模型请求共用一个实际调用槽；本地 analyst 保留另一个现有槽。
- Python 使用已安装 Node 对 wire JSON 做 ECMAScript 序列化，避免科学计数/大整数哈希和后端不一致。

## 必须保持真实的未完成项

- 原生 HTTP/terminal 任意外网出站默认拒绝，防止绕过账户输出权限；外网读取/发布需要接入受账户权限约束的出站代理，不能简单打开所有 443。
- compression / 后台记忆审核已有严格辅助执行后端接口，但实际 Hermes 提示模板、请求路由和压缩后的上下文重组尚未联合验收。
- `execute_code` 内部组合业务工具尚未联合验收，不能把工具名称存在当成业务流程可用。
- Linux 节点还没有等效 OS sandbox launcher；不支持时在执行前明确报错，禁止悄悄使用未隔离宿主机。
- 全部调用路径的跨进程订阅额度/共享调用池还需统一；独立 policy pool 的测试不代表已经接入生产运输层。
- 真实 Node 后端 + 原生 Hermes + 门店业务联合验收、生产发布与收银验收未完成。

## 可复验命令

只使用已有 Node、Python 和 Hermes 依赖，不安装包、不调用真实模型。固定已验证 Hermes SHA；不要直接对不断更新的默认 checkout 做“同版本”声明。

```sh
python3 -B scripts/hermes_employee/test_native_runtime.py
python3 -B scripts/hermes_employee/test_private_gateway.py
node --test tests/stoploss/native-runtime-policy-check.cjs
python3 scripts/with-docker-test.py -- python3 scripts/test-operations-role.py tests/stoploss/native-runtime-backend-check.cjs
```

实际原生测试需在现有 Hermes venv 中执行 `export_native_manifest.py SOURCE MANIFEST`，再执行 `test_native_runtime.py --real SOURCE MANIFEST`。这是实际 Hermes/SDK/OS 沙箱加本地合成 provider/Port；不宣称真实模型或生产业务验收。

`EMPLOYEE_HERMES_NATIVE_MANIFEST` 是部署方提供的受审工具模板和 profile hash。缺失时仍使用原模式。不得在未满足上述未完成项时通过设置此变量冒充完整上线。
