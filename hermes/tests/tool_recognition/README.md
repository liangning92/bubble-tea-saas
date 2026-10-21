# Actual a719 tool recognition regression

This filesystem-only fixture installs the caller's full hash lock into a fresh
owned temporary Python 3.11 venv and exports pinned a719 tracked source. It runs
the original AIAgent constructor, tool registry, validation and conversation loop.
Native MCP and model transport are explicitly synthetic callbacks. It never starts
a gateway, connects a network socket, reads a default profile or calls MiniMax.

```sh
OPENSSL_DIR=/your/openssl PATH=/your/rust/bin:$PATH python3 hermes/tests/tool_recognition/run.py --lock /absolute/full-gateway-requirements.lock --hermes-source /absolute/read-only/a719-checkout --gateway-python /absolute/python3.11 --uv /absolute/uv --mode both
```

Before: default tool search `auto` replaces the plugin aliases with `tool_search`,
`tool_describe`, `tool_call`. A hydrated synthetic claim hits the real name check,
produces three unknown-tool corrections, and ends partial. Its one synthetic model
request is not repeated. The program get/claim/evidence operations remain separate.

After: explicit tool search `off` preserves exactly four raw aliases in both the
actual schema and cached name snapshot. Each name passes the real validator; a
synthetic report executes through actual middleware and leaves the fake native
task awaiting human review. Raw alias handlers deny direct execution, and an
unregistered call does not invoke native operations. No model completion implies
manager verification or business completion.

Captured before/after/cleanup evidence is in `output/tool-recognition/`. The final
fresh-environment pair passed with one simulated model request per side and zero
real provider requests. The whole temporary environment was removed. The full
HTTP/PG fixture has been updated to accept only explicit fresh dependency sites
and require provider get/report schema, but that revised full fixture has not
been run in this patch; the root integration runs it after building its backend.

Root cause in pinned a719: `model_tools.py:_compute_tool_definitions` assembles
deferrable plugin aliases through `tools/tool_search.py`. Default auto activation
removes the raw aliases. `agent_init.py:_load_tools` caches the assembled names;
`turn_tool_validation.py:validate_tool_calls` checks them before execution
middleware. Registration alone therefore did not make relay tool calls executable.
