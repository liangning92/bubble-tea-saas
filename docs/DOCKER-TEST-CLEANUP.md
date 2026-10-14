# Docker 测试结束自动清理

本机正式服务仅使用 `bubble-tea-api/admin/pos/staff/db/redis` 六个容器与正式 Cloudflare Tunnel。禁止启动旧 PM2、Vite 或旧临时隧道抢占正式端口。保留正式数据库、上传文件、备份任务和其他项目的数据。

所有本地 Docker 测试必须使用包装器：

```sh
python3 scripts/with-docker-test.py -- sh tests/my-docker-check.sh
```

包装器为每批测试设置唯一 `BT_TEST_RUN`、`BT_TEST_LABEL`、`COMPOSE_PROJECT_NAME`。测试创建的每个容器、网络、卷、镜像都必须带 `--label "$BT_TEST_LABEL"`，资源名称必须为 `$BT_TEST_RUN-用途`，镜像名必须为 `$BT_TEST_RUN:用途`。容器加 `--rm`，数据库显式使用带标签的测试卷，禁止匿名卷。仅使用临时随机端口或不映射端口，禁止挂载正式卷或使用正式凭据。

```sh
docker volume create --label "$BT_TEST_LABEL" "$BT_TEST_RUN-data"
docker run --rm --name "$BT_TEST_RUN-check" --label "$BT_TEST_LABEL" \
  --network none --mount "type=volume,src=$BT_TEST_RUN-data,dst=/test" \
  alpine:latest sh -c 'echo isolated-test > /test/result'
```

Compose 项目也必须为 services、volumes、networks 和 build.labels 显式添加 `com.bubbletea.test-run: ${BT_TEST_RUN}`，并使用上述名称规则。不得把正式部署文件直接用于测试。构建测试镜像必须创建名称等于 `$BT_TEST_RUN` 的独立 `docker-container` Buildx builder，并通过 `--builder "$BT_TEST_RUN" --load --label "$BT_TEST_LABEL" -t "$BT_TEST_RUN:check"` 构建。包装器在收尾时自动移除该 builder 及其缓存；不要使用共享 builder 写入测试缓存。

正常结束、命令失败、Ctrl+C、TERM、HUP 均触发本批次清理，返回原测试退出码；清理失败会让任务失败并输出残留信息。包装器不执行全局 prune，不影响并行测试，也不删除其他容器引用的镜像、卷或网络。测试日志与截图保存到项目 output，不放在待清理容器内。清理结束必须再次检查本批次标签无残留，并核对正式健康检查。

断电、强制 KILL 无法运行 finally。保留输出的批次号，在恢复后执行以下幂等命令，并核对残留：

```sh
python3 scripts/with-docker-test.py --cleanup bt-test-0123456789ab
```

未打标签的历史资源只能在核对归属、容器引用及备份后一次性清理；禁止用全局 `docker system prune --volumes` 代替测试收尾。
