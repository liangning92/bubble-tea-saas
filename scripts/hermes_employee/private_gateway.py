"""Disabled-by-default private transport for the existing trusted stdio runtime.

No credential enrollment, model decisions, public listener, or auto-resumption.
Construct Gateway explicitly with private deployment config; importing starts nothing.
"""
from __future__ import annotations
import hashlib
from contextlib import suppress
import fcntl
import hmac
import http.client
import ipaddress
import json
import os
from pathlib import Path
import queue
import re
import signal
import socket
import sqlite3
import subprocess
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import parse
import uuid

PROTOCOL = "employee_work_trace_v1"
METHODS = {"recordInput", "recordResponse", "executeTool", "recordOutput", "markUnknown"}
MAX_BODY = 2_000_000


def private_url(value):
    u = parse.urlsplit(value)
    if u.scheme != "http" or u.hostname not in {"127.0.0.1", "::1", "host.docker.internal"} or u.username or u.password or u.fragment or u.query:
        raise ValueError("PRIVATE_ENDPOINT_REQUIRED")
    return value


class Gateway:
    def __init__(self, *, journal, bearer, backend_rpc_url, python=None, repository=None,
                 hermes_source=None, hermes_sha=None, isolated_root=None, provider_base_url=None,
                 command_factory=None, max_seconds=86400):
        if not bearer or len(bearer) < 32:
            raise ValueError("GATEWAY_BEARER_REQUIRED")
        self.bearer, self.rpc_url = bearer, private_url(backend_rpc_url)
        self.root, self.provider = isolated_root, provider_base_url
        self.max_seconds = min(max_seconds, 86400)
        self.lock, self.capacity = threading.Lock(), threading.BoundedSemaphore(4)
        self.stopping = threading.Event()
        self.children = {}
        # One live gateway owns a journal. A second process cannot relabel a
        # still-running child's admission as interrupted and start competing work.
        self.journal_lock = os.open(str(journal)+'.lock', os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW, 0o600)
        try: fcntl.flock(self.journal_lock, fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BaseException:
            os.close(self.journal_lock)
            raise ValueError('GATEWAY_JOURNAL_ALREADY_OWNED') from None
        self.db = sqlite3.connect(journal, check_same_thread=False, isolation_level=None)
        self.db.execute("CREATE TABLE IF NOT EXISTS admission (id TEXT PRIMARY KEY, digest TEXT NOT NULL, state TEXT NOT NULL, code TEXT)")
        self.db.execute("UPDATE admission SET state='unknown',code='GATEWAY_RESTARTED' WHERE state='running'")
        os.chmod(journal, 0o600)
        if command_factory is not None:
            self.command_factory = command_factory  # isolated harness only, never an HTTP field
        else:
            for p in [repository, hermes_source, isolated_root]:
                if not p or not Path(p).is_absolute() or str(Path(p).resolve()) != p:
                    raise ValueError("CANONICAL_DEPLOYMENT_PATH_REQUIRED")
            if not python or not Path(python).is_absolute() or not Path(python).is_file() or not Path(isolated_root).is_dir() or Path(isolated_root).stat().st_mode & 0o077:
                raise ValueError("PRIVATE_DEPLOYMENT_REQUIRED")
            if len(hermes_sha or "") != 40 or any(c not in "0123456789abcdef" for c in hermes_sha):
                raise ValueError("SOURCE_PIN_REQUIRED")
            bootstrap = 'import sys,runpy;sys.path.insert(0,sys.argv[1]);from pdca_launcher import verify_source_tree;verify_source_tree(__import__("pathlib").Path(sys.argv[2]),expected_commit=sys.argv[3]);runpy.run_path(sys.argv[4],run_name="__main__")'
            command = [python, "-I", "-B", "-c", bootstrap, str(Path(repository)/"hermes"), hermes_source, hermes_sha, str(Path(repository)/"scripts/hermes_employee/host_stdio.py")]
            self.command_factory = lambda _: command
        self.hermes_source, self.hermes_sha = hermes_source, hermes_sha

    def close(self):
        """Call after stopping the listener and all owned executions."""
        with self.lock:
            if self.db.execute("SELECT 1 FROM admission WHERE state='running' LIMIT 1").fetchone():
                raise ValueError('GATEWAY_EXECUTIONS_STILL_RUNNING')
            self.db.close()
            fcntl.flock(self.journal_lock, fcntl.LOCK_UN)
            os.close(self.journal_lock)

    def receipt(self, execution):
        with self.lock:
            row = self.db.execute("SELECT state,code FROM admission WHERE id=?", (execution,)).fetchone()
        if not row:
            raise KeyError("NOT_FOUND")
        return {"executionId": execution, "state": row[0], **({"code": row[1]} if row[1] else {})}

    def admit(self, envelope):
        if self.stopping.is_set(): raise ValueError("GATEWAY_STOPPING")
        if set(envelope) != {"ticket", "deadlineAt", "callbackCredential", "providerCredential"}:
            raise ValueError("INVALID_ENVELOPE")
        ticket = envelope["ticket"]
        execution = str(uuid.UUID(ticket["executionId"]))
        if execution != ticket["executionId"] or ticket["protocol"] != PROTOCOL or not isinstance(ticket["traceVersion"], int):
            raise ValueError("INVALID_TICKET")
        if any(not isinstance(envelope[k], str) or len(envelope[k]) < 16 for k in ["callbackCredential", "providerCredential"]):
            raise ValueError("SCOPED_CREDENTIAL_REQUIRED")
        until = datetime.fromisoformat(envelope["deadlineAt"].replace("Z", "+00:00")).timestamp()
        remaining = until - time.time()
        if not 0 < remaining <= self.max_seconds:
            raise ValueError("EXECUTION_DEADLINE_REQUIRED")
        digest = hashlib.sha256(json.dumps(envelope, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        with self.lock:
            row = self.db.execute("SELECT digest FROM admission WHERE id=?", (execution,)).fetchone()
            if row and not hmac.compare_digest(row[0], digest):
                raise ValueError("ADMISSION_BINDING_CONFLICT")
            if not row:
                if not self.capacity.acquire(blocking=False):
                    raise ValueError("GATEWAY_BUSY")
                try:
                    self.db.execute("INSERT INTO admission VALUES (?,?, 'running',NULL)", (execution, digest))
                except BaseException:
                    self.capacity.release()
                    raise
                threading.Thread(target=self._run, args=(envelope, until), daemon=True).start()
        return self.receipt(execution)

    def _rpc(self, envelope, method, params, until):
        payload = {"executionId": envelope["ticket"]["executionId"], "method": method, "params": params}
        endpoint = parse.urlsplit(self.rpc_url)
        connection = http.client.HTTPConnection(endpoint.hostname, endpoint.port, timeout=max(.001, min(10, until-time.time())))
        def expire():
            try:
                if connection.sock: connection.sock.shutdown(socket.SHUT_RDWR)
            except OSError: pass
            connection.close()
        timer = threading.Timer(max(.001,until-time.time()),expire)
        timer.daemon=True;timer.start()
        try:
            connection.request('POST',endpoint.path or '/',body=json.dumps(payload).encode(),headers={"Content-Type": "application/json", "Authorization": "Bearer " + envelope["callbackCredential"]})
            sock = connection.sock
            # Own the response socket lifecycle: HTTPConnection.getresponse()
            # closes its socket immediately for HTTP/1.0 Connection:close, which
            # would prevent applying the remaining absolute deadline per read.
            response = http.client.HTTPResponse(sock, method='POST')
            response.begin()
            status = response.status
            chunks, size = [], 0
            while True:
                remaining = min(10,until-time.time())
                if remaining <= 0: raise ValueError('RPC_DEADLINE')
                sock.settimeout(remaining)
                chunk = response.read1(min(65536,MAX_BODY+1-size))
                if not chunk: break
                chunks.append(chunk);size += len(chunk)
                if size > MAX_BODY: raise ValueError('RPC_RESPONSE_TOO_LARGE')
            raw = b''.join(chunks)
        finally:
            timer.cancel()
            if 'response' in locals(): response.close()
            connection.close()
        if not 200 <= status < 300:
            try: code = json.loads(raw).get('code')
            except (ValueError, AttributeError): code = None
            # Only stable backend categories cross into the journal. Never retain
            # response prose, URLs, tokens or stack traces as a failure code.
            raise ValueError(code if isinstance(code,str) and re.fullmatch(r'(?:EMPLOYEE|TEAM)_[A-Z0-9_]{1,90}',code) else 'RPC_REJECTED')
        value = json.loads(raw)
        if set(value) != {"result"}:
            raise ValueError("RPC_UNCONFIRMED")
        return value["result"]

    def _run(self, envelope, until):
        ticket, child = envelope["ticket"], None
        execution, version = ticket["executionId"], ticket["traceVersion"]
        finished, output_stored, state, code = False, False, "unknown", "GATEWAY_CHILD_UNCONFIRMED"
        try:
            child = subprocess.Popen(self.command_factory(envelope), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, encoding="utf-8", env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUNBUFFERED": "1"}, start_new_session=True,
                cwd=self.root)
            with self.lock:
                self.children[execution] = child
            if self.stopping.is_set():
                raise ValueError("GATEWAY_STOPPING")
            config = {"isolatedRoot": self.root, "homePath": str(Path(self.root)/"homes"/hashlib.sha256(execution.encode()).hexdigest()), "hermesSource": self.hermes_source,
                "hermesExpectedSha": self.hermes_sha, "providerBaseUrl": self.provider, "providerCredential": envelope["providerCredential"]}
            child.stdin.write(json.dumps({"ticket": ticket, "config": config})+"\n"); child.stdin.flush()
            frames = queue.Queue()
            def read():
                try:
                    while True:
                        line = child.stdout.readline(MAX_BODY+1)
                        frames.put(line)
                        if not line: break
                except BaseException:
                    frames.put("")
            threading.Thread(target=read, daemon=True).start()
            total = 0
            while True:
                line = frames.get(timeout=max(.001, until-time.time()))
                if not line: break
                total += len(line)
                if len(line) > MAX_BODY or total > (24_000_000 if isinstance(ticket.get("sealedUserContent"), list) else 8_000_000) or not line.endswith("\n"):
                    raise ValueError("FRAME_LIMIT")
                frame = json.loads(line)
                if set(frame) != {"protocol", "method", "params"} or frame["protocol"] != PROTOCOL:
                    raise ValueError("INVALID_FRAME")
                method, params = frame["method"], frame["params"]
                if method == "finished":
                    if finished or not output_stored or params.get("unknown") or params.get("stored", {}).get("requestId") != ticket["requestId"] or params["stored"].get("traceVersion") != version:
                        raise ValueError("FINISHED_WITHOUT_STORED_OUTPUT")
                    finished = True
                    continue
                if finished or method not in METHODS or params.get("executionId") != execution or params.get("expectedTraceVersion") != version:
                    raise ValueError("FRAME_ORDER")
                result = self._rpc(envelope, method, params, until)
                if method == "markUnknown":
                    raise ValueError("CHILD_UNKNOWN")
                if not isinstance(result, dict) or result.get("traceVersion") != version+1:
                    raise ValueError("RPC_VERSION")
                version = result["traceVersion"]
                if method == "recordOutput":
                    if result.get("requestId") != ticket["requestId"] or result.get("text") != params.get("providerMessage", {}).get("content"):
                        raise ValueError("OUTPUT_RECEIPT")
                    output_stored = True
                child.stdin.write(json.dumps({"result": result})+"\n"); child.stdin.flush()
            if child.wait(timeout=max(.001, until-time.time())) == 0 and finished:
                state, code = "complete", None
        except BaseException as error:
            # No raw exception/URL/provider prose is logged or persisted.
            candidate = str(error)
            if re.fullmatch(r'(?:EMPLOYEE|TEAM|RPC)_[A-Z0-9_]{1,90}',candidate):
                code = candidate
        finally:
            try:
                if child and child.poll() is None:
                    # The child may exit between poll and signal delivery.
                    with suppress(ProcessLookupError):
                        os.killpg(child.pid, signal.SIGTERM)
                    try: child.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        with suppress(ProcessLookupError):
                            os.killpg(child.pid, signal.SIGKILL)
                        child.wait()
            finally:
                # Buffered stdin.close() may flush a reply to a pipe already closed
                # by the failed child. Cleanup must still persist uncertainty and
                # return the slot; otherwise four failures stop all later work.
                if child:
                    for pipe in (child.stdin, child.stdout):
                        with suppress(OSError, ValueError):
                            pipe.close()
                if state == "unknown":
                    try: self._rpc(envelope, "markUnknown", {"executionId": execution, "expectedTraceVersion": version, "code": code}, max(until, time.time()+1))
                    except BaseException: pass
                with self.lock:
                    try:
                        self.db.execute("UPDATE admission SET state=?,code=? WHERE id=? AND state='running'", (state, code, execution))
                    finally:
                        self.capacity.release()
                        self.children.pop(execution, None)

    def interrupt(self):
        self.stopping.set()
        with self.lock:
            children = list(self.children.values())
        for child in children:
            with suppress(ProcessLookupError):
                os.killpg(child.pid, signal.SIGTERM)

    def server(self, host="127.0.0.1", port=0):
        if not ipaddress.ip_address(host).is_loopback:
            raise ValueError("LOOPBACK_LISTENER_REQUIRED")
        gateway = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def respond(self, status, value):
                raw = json.dumps(value).encode()
                self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)
            def allowed(self):
                return hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer "+gateway.bearer)
            def do_POST(self):
                if not self.allowed(): return self.respond(401, {"error": "UNAUTHORIZED"})
                if self.path != "/employee-runs": return self.respond(404, {"error": "NOT_FOUND"})
                try:
                    size = int(self.headers.get("Content-Length", "0"))
                    if not 0 < size <= MAX_BODY: raise ValueError("BODY_LIMIT")
                    value = gateway.admit(json.loads(self.rfile.read(size)))
                    return self.respond(202, value)
                except BaseException:
                    return self.respond(409, {"error": "ADMISSION_REJECTED"})
            def do_GET(self):
                if self.path == "/health": return self.respond(200, {"status": "ok", "protocol": "employee_work_trace_v1"})
                if not self.allowed(): return self.respond(401, {"error": "UNAUTHORIZED"})
                try:
                    if not self.path.startswith("/employee-runs/"): raise KeyError()
                    execution = self.path[len("/employee-runs/"):]
                    if str(uuid.UUID(execution)) != execution: raise KeyError()
                    return self.respond(200, gateway.receipt(execution))
                except BaseException: return self.respond(404, {"error": "NOT_FOUND"})
        return ThreadingHTTPServer((host, port), Handler)
