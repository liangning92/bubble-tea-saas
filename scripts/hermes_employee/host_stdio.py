"""Trusted host's child-process transport for EmployeeRuntimeHostPort.

No enrollment, daemon, outbound employee message or default profile. Launch explicitly with
the installed Hermes venv Python -I -B. First stdin line contains {ticket, config}; credentials
remain on the private pipe. Subsequent frames transport the mainline port methods verbatim.
The backend must authenticate/own this child, validate schemas and independently admit output.
"""
import contextlib
import json
import os
from pathlib import Path
import sys
import tempfile


def main(*, provider_send=None):
    wire_out = sys.stdout
    first = json.loads(sys.stdin.readline())
    ticket, config = first["ticket"], first["config"]
    root = Path(config["isolatedRoot"])
    if not root.is_absolute() or root.resolve() != root or root.is_symlink():
        raise ValueError("CANONICAL_ISOLATED_ROOT_REQUIRED")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    home = tempfile.mkdtemp(prefix="employee-home-", dir=root)
    os.environ.clear()
    os.environ.update(HOME=home, PATH="/usr/bin:/bin", PYTHONDONTWRITEBYTECODE="1", NO_PROXY="*")
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from runtime_capture import run_ticket
    sys.path.insert(0, config["hermesSource"])
    import httpx
    send = provider_send or httpx.Client.send

    def rpc(method, params):
        wire_out.write(json.dumps({"protocol": "employee_work_trace_v1", "method": method, "params": params}, ensure_ascii=False) + "\n")
        wire_out.flush()
        response = json.loads(sys.stdin.readline())
        if set(response) != {"result"}:
            raise RuntimeError("TRUSTED_HOST_RPC_UNCONFIRMED")
        return response["result"]

    class Port:
        def recordInput(self, value): return rpc("recordInput", value)
        def recordResponse(self, value): return rpc("recordResponse", value)
        def executeTool(self, value): return rpc("executeTool", value)
        def recordOutput(self, value): return rpc("recordOutput", value)
        def markUnknown(self, execution, version, code):
            return rpc("markUnknown", {"executionId": execution, "expectedTraceVersion": version, "code": code})

    # Library logs never become protocol frames. No child-generated allow decision exists.
    with contextlib.redirect_stdout(sys.stderr):
        result = run_ticket(ticket, config, Port(), provider_send=send)
    wire_out.write(json.dumps({"protocol": "employee_work_trace_v1", "method": "finished", "params": result}, ensure_ascii=False) + "\n")
    wire_out.flush()


if __name__ == "__main__":
    main()
