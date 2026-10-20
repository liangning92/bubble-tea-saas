# One isolated full Hermes loop

This fixture runs unchanged tracked Hermes source at
`a7198a8855ad98681114ff5138eb01fe132a62e7`, exported with `git archive`.
It exercises the actual CLI gateway `/v1/runs`, actual `run_agent.AIAgent`, plugin
bridge, dedicated runtime, official Python MCP 1.27 client, real backend task
service/production bindings and restricted model relay. The AS, credentials,
inventory and MiniMax transport are synthetic and confined to owned loopback TLS
and a temporary PostgreSQL instance.

Run only with already-built API dist and an owned temporary Python 3.11 SDK venv:

```sh
python3 scripts/with-docker-test.py -- python3 hermes/tests/full_loop/run.py --sdk-python /absolute/owned/venv311/bin/python
```

`requirements-gateway.txt` is the runtime increment, including the pinned
`aiohttp==3.14.3` required by a719's `RequestKey` import. The fixture also reads
existing Hermes dependency packages without executing their `.pth` files. The
full read-only dependency version manifest is recorded under
`output/hermes-full-loop/readonly-hermes-dependencies.json`; this is not evidence
of a completely fresh, independently reconstructed gateway environment.

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
