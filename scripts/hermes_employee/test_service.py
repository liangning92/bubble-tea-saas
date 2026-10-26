import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from serve_gateway import load_config


class ServiceTests(unittest.TestCase):
    def config(self, root):
        secret = root / "gateway-bearer"
        secret.write_text("synthetic-gateway-bearer-" + "a" * 32)
        secret.chmod(0o600)
        config = {"repository": str(Path(__file__).resolve().parents[2]), "hermesSource": os.environ.get("HERMES_TEST_SOURCE", str(root)),
                  "isolatedRoot": str(root), "journal": str(root / "admission.sqlite"), "gatewayBearerFile": str(secret),
                  "python": os.environ.get("HERMES_TEST_PYTHON", sys.executable), "hermesExpectedSha": "a7198a8855ad98681114ff5138eb01fe132a62e7",
                  "listenHost": "127.0.0.1", "listenPort": 0, "backendRpcUrl": "http://127.0.0.1:49191/rpc",
                  "providerBaseUrl": "http://127.0.0.1:49191/v1", "sourceSha": "a" * 40,
                  "expiresAt": "2020-01-01T00:00:00Z"}
        file = root / "config.json"
        file.write_text(json.dumps(config))
        file.chmod(0o600)
        return file, config

    def test_service_lifetime_is_independent_from_old_pilot_expiry(self):
        with tempfile.TemporaryDirectory() as tmp:
            file, _ = self.config(Path(tmp).resolve())
            self.assertEqual(load_config(str(file))["expiresAt"], "2020-01-01T00:00:00Z")

    def test_nonprivate_configuration_or_secret_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            file, config = self.config(Path(tmp).resolve())
            file.chmod(0o644)
            with self.assertRaises(ValueError):
                load_config(str(file))
            file.chmod(0o600)
            Path(config["gatewayBearerFile"]).chmod(0o644)
            with self.assertRaises(ValueError):
                load_config(str(file))

    @unittest.skipUnless(os.environ.get("HERMES_TEST_SOURCE"), "requires the installed pinned Hermes source")
    def test_real_service_starts_without_terminal_and_stops_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            file, config = self.config(root)
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", 0))
                config["listenPort"] = probe.getsockname()[1]
            file.write_text(json.dumps(config))
            for _ in range(2):
                process = subprocess.Popen([config["python"], "-I", "-B", str(Path(__file__).with_name("serve_gateway.py")), "--config", str(file)],
                                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, start_new_session=True)
                try:
                    end = time.monotonic() + 30
                    while time.monotonic() < end:
                        if process.poll() is not None:
                            self.fail("service exited: " + process.stderr.read().decode()[-3000:])
                        try:
                            with urllib.request.urlopen(f"http://127.0.0.1:{config['listenPort']}/health", timeout=.3) as response:
                                self.assertEqual(json.load(response)["protocol"], "employee_work_trace_v1")
                                break
                        except OSError:
                            time.sleep(.05)
                    else:
                        self.fail("service did not become reachable")
                    state = json.loads((root / "service-state.json").read_text())
                    self.assertEqual(state["state"], "listening")
                    self.assertEqual(state["pid"], process.pid)
                finally:
                    process.send_signal(signal.SIGTERM)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                    process.stderr.close()
                self.assertEqual(process.returncode, 0)
                self.assertEqual(json.loads((root / "service-state.json").read_text())["state"], "stopped")


if __name__ == "__main__":
    unittest.main()
