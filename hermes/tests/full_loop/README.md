# One isolated full Hermes loop

This fixture runs unchanged tracked Hermes source at
`a7198a8855ad98681114ff5138eb01fe132a62e7`, exported with `git archive`.
It exercises the actual CLI gateway `/v1/runs`, actual `run_agent.AIAgent`, plugin
bridge, dedicated runtime, official Python MCP 1.27 client, real backend task
service/production bindings and restricted model relay. The AS, credentials,
inventory and MiniMax transport are synthetic and confined to owned loopback TLS
and a temporary PostgreSQL instance.

Run only with already-built API dist and an owned temporary Python 3.11 **full gateway** venv (official SDK 1.27 plus the hash-locked gateway dependencies):

```sh
python3 scripts/with-docker-test.py -- python3 hermes/tests/full_loop/run.py --sdk-python /absolute/owned/venv311/bin/python --hermes-source /absolute/read-only/a719-checkout
```

The fixture now reads only that explicit fresh venv's site-packages with `-S`.
It does not read default or live Hermes dependency sites. A prior successful run
used read-only existing dependencies; that historical result below does not
validate this new fresh-environment fixture revision. The caller must supply the
full lock rather than combine the increment with a user environment.

The provider request must expose exactly `store_task_get` and `store_task_report`;
the actual Hermes registry still contains all four native aliases for program
preparation. The dedicated config sets `tools.tool_search.enabled: off` so Hermes
keeps those aliases in its cached `valid_tool_names` snapshot. Preparation is
performed by the bridge program before the model; it is not a model acceptance.

The test-only launcher and factory use owned localhost pins. Production
`activate()` remains fixed to its public endpoints and is not exercised or
weakened. The first synthetic attempt correctly failed its production pin check;
`initial-production-pin-refusal.json` preserves that result. A second attempt
exposed the older read-only aiohttp 3.13.5 missing `RequestKey`; its failure logs
and cleanup are retained. Only the temporary venv received aiohttp 3.14.3.

The child uses a private HOME/HERMES_HOME, a whitelist environment and `-S`.
An audit hook denies actual user configuration reads, non-loopback networking
and subprocess creation before those OS operations. Startup capability probes
may be denied and recorded; these remain blocked rather than silently enabled.
An observer calls the original AIAgent constructor and records its resolved four
exact tools, zero fallbacks, disabled memory/profile/compression and disabled
streaming. It does not replace the agent or its conversation loop.

The one successful case (`bt-test-96caad0a00b1`) made one synthetic provider call,
four native MCP tool calls and one native report. The durable task remained
`awaiting_review` and unverified; stock stayed unchanged. The case does not prove
real MiniMax latency, production AS enrollment, production activation, callbacks,
Dot/device delivery, manager review/rework, or other gateway capabilities.
Optional dependency warnings are preserved in gateway logs, not repaired by
expanding this scoped test. Every owned process/database/file was removed.

Fixture recovery delta: status GET timeouts are retried only inside the same
45-second absolute deadline; the dispatch POST remains outside that loop and is
sent once. Non-timeout errors still fail immediately. A short owned `{BT_TEST_RUN}-h-*` base with direct `stock-ro-001` profile
preserves the batch-owner and exact profile-name guards and keeps the real a719 loop-tick UNIX socket below Darwin's 104-byte boundary.
`test_full_loop_fixture.py` passed all five targeted tests, including an actual
owned UNIX socket bind and cleanup. This does not replace the pending full loop
rerun or change its deadline.
