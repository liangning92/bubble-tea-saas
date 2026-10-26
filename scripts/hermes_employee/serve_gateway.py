"""Supervised private Hermes service. Authorization lives in the store backend.

Run with the installed Hermes venv and --config <private JSON>. A terminal is not
the supervisor. See ops/agent-pilot/employee-gateway.plist.in for launchd hosting.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time


def load_config(path):
    p = Path(path)
    if not p.is_absolute() or p.resolve() != p or not p.is_file() or p.stat().st_mode & 0o077:
        raise ValueError("PRIVATE_GATEWAY_CONFIG_REQUIRED")
    value = json.loads(p.read_text())
    # An old trial's expiresAt must not stop a permanent service. Each execution
    # still has an absolute backend-issued deadline and fresh backend authority.
    for key in ["repository", "hermesSource", "isolatedRoot", "journal", "gatewayBearerFile", "python"]:
        if not Path(value[key]).is_absolute():
            raise ValueError("ABSOLUTE_SERVICE_PATH_REQUIRED")
    secret = Path(value["gatewayBearerFile"])
    if secret.resolve() != secret or secret.stat().st_mode & 0o077:
        raise ValueError("PRIVATE_GATEWAY_BEARER_REQUIRED")
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    config = load_config(parser.parse_args().config)
    sys.path.insert(0, str(Path(config["repository"]) / "hermes"))
    from pdca_launcher import verify_source_tree
    verify_source_tree(Path(config["hermesSource"]), expected_commit=config["hermesExpectedSha"])
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from private_gateway import Gateway
    gateway = Gateway(journal=config["journal"], bearer=Path(config["gatewayBearerFile"]).read_text().strip(),
                      backend_rpc_url=config["backendRpcUrl"], python=config["python"], repository=config["repository"],
                      hermes_source=config["hermesSource"], hermes_sha=config["hermesExpectedSha"],
                      isolated_root=config["isolatedRoot"], provider_base_url=config["providerBaseUrl"], max_seconds=86400)
    server = gateway.server(config["listenHost"], config["listenPort"])
    state_path = Path(config["isolatedRoot"]) / "service-state.json"

    def state(value):
        temporary = state_path.with_suffix(".tmp")
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as output:
            json.dump({"state": value, "pid": os.getpid(), "sourceSha": config["sourceSha"], "updatedAt": time.time()}, output)
        os.replace(temporary, state_path)

    def stop(*_args):
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    state("listening")
    try:
        server.serve_forever(poll_interval=.25)
    finally:
        server.server_close()
        gateway.interrupt()
        # launchd's process-group cleanup interrupts children on shutdown. The
        # journal owns uncertain outcomes; restarting never replays an admission.
        state("stopping")
        end = time.monotonic() + 45
        while time.monotonic() < end:
            with gateway.lock:
                running = gateway.db.execute("SELECT 1 FROM admission WHERE state='running' LIMIT 1").fetchone()
            if not running:
                gateway.close()
                state("stopped")
                return
            time.sleep(.1)
        state("interrupted")


if __name__ == "__main__":
    main()
