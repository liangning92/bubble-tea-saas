"""Owned isolated-test gateway host. No default profile, credentials or listener."""
import json
from pathlib import Path
import sys
import threading
import time

config = json.loads(sys.stdin.readline())
sys.path.insert(0, str(Path(config.pop('repository')) / 'scripts' / 'hermes_employee'))
from private_gateway import Gateway
# All deployment choices are explicitly supplied on this private pipe by the
# harness; no model input can select endpoints, source tree or credentials.
repository = config.pop('sourceRepository')
gateway = Gateway(repository=repository, **config)
server = gateway.server('127.0.0.1', 0)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
print(json.dumps({'port': server.server_port}), flush=True)
try:
    sys.stdin.readline()
finally:
    server.shutdown()
    server.server_close()
    deadline = time.monotonic() + 125
    while time.monotonic() < deadline:
        with gateway.lock:
            active = gateway.db.execute("SELECT 1 FROM admission WHERE state IN ('queued','running') LIMIT 1").fetchone()
        if not active:
            break
        time.sleep(.05)
    gateway.close()
