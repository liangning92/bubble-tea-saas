"""Explicit, dedicated-profile Hermes adapter. Importing does no I/O or registration.

Only backend references cross the model boundary. Credentials are supplied per request
by the dedicated credential broker and are never retained in the journal.
"""
from __future__ import annotations

import copy
import asyncio
import types
import fcntl
import http.client
import json
import os
import re
import stat
import socket
import threading
import tempfile
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

TOOLS = frozenset({"store_task_get", "store_task_claim", "store_task_read_stock_evidence", "store_task_report"})
SCOPES = frozenset({"executor.claim", "executor.evidence", "executor.report"})
MODEL = "MiniMax-M3.1-Flash"
RELAY_PATH = "/agent-model/v1/chat/completions"
NAMESPACE = uuid.UUID("8de88775-3f04-4ef8-80b7-4175e453a8eb")


class Blocked(Exception):
    """Safe program status; never includes credentials or raw remote errors."""


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def identifier(value):
    if not isinstance(value, str) or str(uuid.UUID(value)) != value:
        raise Blocked("INVALID_REFERENCE")
    return value


def positive(value):
    if type(value) is not int or value < 1:
        raise Blocked("INVALID_VERSION")
    return value


def objectify(value):
    if isinstance(value, dict):
        return SimpleNamespace(**{k: objectify(v) for k, v in value.items()})
    if isinstance(value, list):
        return [objectify(v) for v in value]
    return value


@dataclass(frozen=True)
class ProfilePolicy:
    profile: str
    relay_origin: str
    provider_base_url: str
    raw_provider_credential: str  # Literal unusable sentinel, never a real token.
    fallback_providers: tuple
    enabled_tools: frozenset
    executor_scopes: frozenset
    pilot: dict

    def validate(self, now):
        u = urlsplit(self.relay_origin)
        if (not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", self.profile) or self.profile == "default" or u.username or u.password or u.path not in ("", "/") or u.query or u.fragment
                or not (u.scheme == "https" or u.scheme == "http" and u.hostname in ("127.0.0.1", "localhost", "::1"))):
            raise Blocked("DEDICATED_PROFILE_REQUIRED")
        if (self.provider_base_url.rstrip("/") != self.relay_origin.rstrip("/") + "/agent-model/v1"
                or self.raw_provider_credential != "pdca-raw-provider-denied" or self.fallback_providers
                or self.enabled_tools != TOOLS or self.executor_scopes != SCOPES):
            raise Blocked("UNSAFE_RUNTIME_CONFIGURATION")
        # Bootstrap must supply authoritative timestamps; never take a pilot from a prompt.
        from datetime import datetime
        if set(self.pilot) != {"id", "startedAt", "expiresAt"}:
            raise Blocked("INVALID_PILOT")
        identifier(self.pilot["id"])
        start = datetime.fromisoformat(self.pilot["startedAt"].replace("Z", "+00:00")).timestamp()
        end = datetime.fromisoformat(self.pilot["expiresAt"].replace("Z", "+00:00")).timestamp()
        if end - start != 86400 or not start <= now < end:
            raise Blocked("PILOT_EXPIRED")
        return end


    def validate_runtime(self, settings):
        # Supplied by the dedicated bootstrap from its resolved live runtime, not a prompt.
        expected = {"profile": self.profile, "base_url": self.provider_base_url,
                    "api_key": "pdca-raw-provider-denied", "fallback_providers": [],
                    "enabled_tools": sorted(TOOLS), "executor_scopes": sorted(SCOPES),
                    "auxiliary_models_enabled": False, "memory_enabled": False,
                    "compression_enabled": False}
        if settings != expected:
            raise Blocked("UNSAFE_LIVE_RUNTIME")


class Journal:
    """One owner, one run, lock held across I/O; atomic durable reservations before I/O."""
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise Blocked("UNSAFE_JOURNAL_DIRECTORY")

    @contextmanager
    def locked(self, run_id):
        identifier(run_id)
        flags = os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW
        fd = os.open(self.directory / (run_id + ".lock"), flags, 0o600)
        try:
            self._private(fd)
            fcntl.flock(fd, fcntl.LOCK_EX)
            path = self.directory / (run_id + ".json")
            data = {}
            if path.exists() or path.is_symlink():
                readfd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    self._private(readfd)
                    with os.fdopen(os.dup(readfd)) as stream:
                        data = json.load(stream)
                finally:
                    os.close(readfd)
            def save():
                tmpfd, tmp = tempfile.mkstemp(prefix=run_id + ".", dir=self.directory)
                try:
                    with os.fdopen(tmpfd, "w") as stream:
                        stream.write(encoded(data)); stream.flush(); os.fsync(stream.fileno())
                    os.replace(tmp, path)
                    parent = os.open(self.directory, os.O_RDONLY)
                    try: os.fsync(parent)
                    finally: os.close(parent)
                finally:
                    if os.path.exists(tmp): os.unlink(tmp)
            yield data, save
        finally:
            os.close(fd)

    @staticmethod
    def _private(fd):
        x = os.fstat(fd)
        if not stat.S_ISREG(x.st_mode) or x.st_uid != os.getuid() or x.st_mode & 0o077 or x.st_nlink != 1:
            raise Blocked("UNSAFE_JOURNAL_FILE")


class RawMcpSession:
    """Use an already authorized official MCP SDK session on its existing event loop.

    No session/profile discovery, connection creation, rendering, retries or auth here.
    """
    def __init__(self, session, loop, timeout=30):
        self.session, self.loop, self.timeout = session, loop, timeout

    def __call__(self, name, args):
        if name not in TOOLS: raise Blocked("TOOL_NOT_ALLOWED")
        try:
            if asyncio.get_running_loop() is self.loop: raise Blocked("MCP_SYNC_ON_EVENT_LOOP")
        except RuntimeError:
            pass
        future = asyncio.run_coroutine_threadsafe(self.session.call_tool(name, arguments=copy.deepcopy(args)), self.loop)
        try:
            result = future.result(timeout=self.timeout)
            if hasattr(result, "model_dump"):
                result = result.model_dump(by_alias=True)
            if not isinstance(result, dict): raise Blocked("RAW_MCP_RESULT_REQUIRED")
            return result
        except Exception:
            future.cancel()
            raise Blocked("NATIVE_OUTCOME_UNKNOWN") from None


class RelayHttp:
    """No redirects/retries; broker returns a fresh access token for the fixed resource."""
    def __init__(self, origin, credential_provider, timeout=25, *, deadline_at=None, now=time.time):
        self.origin, self.credentials, self.timeout = origin, credential_provider, timeout
        self.deadline_at, self.now = deadline_at, now

    def __call__(self, body_bytes):
        u = urlsplit(self.origin)
        if u.username or u.password or u.path not in ("", "/") or u.query or u.fragment or not (
                u.scheme == "https" or u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1", "::1")):
            raise Blocked("RELAY_ORIGIN_INVALID")
        if not callable(self.deadline_at): raise Blocked("RELAY_DEADLINE_REQUIRED")
        deadline = self.deadline_at()
        def remaining():
            left = deadline - self.now()
            if left <= 0: raise Blocked("PILOT_EXPIRED")
            return min(self.timeout, left)
        remaining()
        token = self.credentials()
        remaining()
        if not isinstance(token, str) or not token or "\r" in token or "\n" in token:
            raise Blocked("CREDENTIAL_UNAVAILABLE")
        cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
        conn = cls(u.hostname, u.port, timeout=remaining())
        socket_ref = [None]
        def abort():
            sock = socket_ref[0] or getattr(conn, "sock", None)
            if sock is not None:
                try: sock.shutdown(socket.SHUT_RDWR)
                except OSError: pass
            conn.close()
        timer = threading.Timer(remaining(), abort); timer.daemon = True
        timer.start()
        try:
            remaining()
            conn.connect()
            socket_ref[0] = getattr(conn, "sock", None)
            remaining()
            conn.request("POST", RELAY_PATH, body=body_bytes, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
            socket_ref[0] = getattr(conn, "sock", None)
            remaining()
            result = conn.getresponse()
            remaining()
            raw = result.read(2_000_001)
            remaining()
            if result.status != 200 or len(raw) > 2_000_000:
                raise Blocked("RELAY_RESPONSE_UNAVAILABLE")
            return json.loads(raw)
        finally:
            timer.cancel()
            conn.close()


class Bridge:
    def __init__(self, policy, journal_directory, raw_mcp_call, relay_call, *, runtime_settings, now=time.time):
        self.policy, self.now = policy, now
        policy.validate(now())
        self.runtime_settings = runtime_settings
        policy.validate_runtime(runtime_settings())
        self.journal = Journal(journal_directory)
        self.mcp, self.relay = raw_mcp_call, relay_call
        self.sessions = {}  # Identifiers only, populated before the first model attempt.

    def capture(self, *, session_id, user_message, **_):
        refs = json.loads(user_message)
        keys = {"taskCode", "taskId", "backendRunId", "eventId", "executorId", "round", "taskVersion", "leaseVersion"}
        if set(refs) != {"schemaVersion", "references"} or refs["schemaVersion"] != 1 or set(refs["references"]) != keys:
            raise Blocked("INVALID_DISPATCH")
        r = refs["references"]
        if r["taskCode"] != "STOCK-RO-001": raise Blocked("INVALID_DISPATCH")
        for k in ("taskId", "backendRunId", "eventId"): identifier(r[k])
        if not isinstance(r["executorId"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", r["executorId"]): raise Blocked("INVALID_DISPATCH")
        for k in ("round", "taskVersion"): positive(r[k])
        if type(r["leaseVersion"]) is not int or r["leaseVersion"] < 0: raise Blocked("INVALID_DISPATCH")
        # Rework shares a session but gets a fresh backend run; never reuse old execution state.
        self.sessions[session_id] = copy.deepcopy(r)

    def _state(self, session_id):
        self.policy.validate(self.now())
        self.policy.validate_runtime(self.runtime_settings())
        if session_id not in self.sessions: raise Blocked("DISPATCH_NOT_CAPTURED")
        return self.sessions[session_id]

    def _operation_id(self, run_id, step):
        return str(uuid.uuid5(NAMESPACE, self.policy.profile + ":" + run_id + ":" + step))

    def _native(self, state, save, name, args, operation):
        operations = state.setdefault("operations", {})
        wire = encoded(args)
        old = operations.get(operation)
        if old and (old["name"] != name or old["bytes"] != wire): raise Blocked("OPERATION_BYTES_CHANGED")
        if old and old["status"] == "done": return copy.deepcopy(old["result"])
        # Only exact idempotent bytes can resume a mutation after an uncertain MCP result.
        if not old:
            old = operations[operation] = {"name": name, "bytes": wire, "status": "sending"}; save()
        self.policy.validate(self.now())
        self.policy.validate_runtime(self.runtime_settings())
        try:
            raw = self.mcp(name, json.loads(old["bytes"]))
        except Exception:
            raise Blocked("NATIVE_OUTCOME_UNKNOWN") from None
        # Do not consume Hermes' rendered/truncated tool text.
        task = raw.get("structuredContent", {}).get("task") if isinstance(raw, dict) else None
        if not isinstance(raw, dict) or raw.get("isError") or not isinstance(task, dict): raise Blocked("NATIVE_RECEIPT_REQUIRED")
        self._check_task(task, state["references"])
        projected = copy.deepcopy(task)
        projected.pop("evidence", None)
        if isinstance(projected.get("report"), dict):
            projected["report"] = {k: projected["report"][k] for k in ("id", "version", "runId", "round", "outcome", "createdAt") if k in projected["report"]}
        old.update(status="done", result=projected); save()
        return copy.deepcopy(task)

    def recover_native(self, session_id, operation):
        """Explicit recovery only: same mutation ID and immutable bytes, never relay POST.

        Backend native APIs perform permanent receipt lookup before version checks. A
        failure remains blocked; there is no version refresh or new operation ID here.
        """
        refs = self._state(session_id)
        with self.journal.locked(refs["backendRunId"]) as (s, save):
            if s.get("blocked") not in (None, "NATIVE_OUTCOME_UNKNOWN"):
                raise Blocked("RECOVERY_NOT_ALLOWED")
            if any(r["status"] != "done" for r in s.get("responses", [])):
                raise Blocked("MODEL_OUTCOME_UNKNOWN")
            op = s.get("operations", {}).get(operation)
            if not op or op["status"] != "sending" or op["name"] not in TOOLS:
                raise Blocked("NO_UNCERTAIN_NATIVE_OPERATION")
            result = self._native(s, save, op["name"], json.loads(op["bytes"]), operation)
            s.pop("blocked", None); save()
            return {"hermesProgram": True, "status": "native_receipt_recovered", "taskVersion": result["taskVersion"]}

    @staticmethod
    def _check_task(task, refs):
        for key, expected in (("taskId", refs["taskId"]), ("runId", refs["backendRunId"]), ("round", refs["round"]), ("executorId", refs["executorId"]), ("taskCode", "STOCK-RO-001")):
            if task.get(key) != expected: raise Blocked("BACKEND_BINDING_CHANGED")
        positive(task.get("taskVersion")); positive(task.get("leaseVersion")) if task.get("state") != "assigned" else None

    def _prepare(self, state, save, refs):
        if not state:
            state.update(references=copy.deepcopy(refs), profile=self.policy.profile, pilot=self.policy.pilot, operations={}, responses=[]); save()
        if state["references"] != refs or state["profile"] != self.policy.profile or state["pilot"] != self.policy.pilot:
            raise Blocked("JOURNAL_BINDING_CHANGED")
        if state.get("binding"): return
        task = self._native(state, save, "store_task_get", {"taskId": refs["taskId"]}, "initial-get")
        claim = {"taskId": refs["taskId"], "runId": refs["backendRunId"], "round": refs["round"], "expectedVersion": refs["taskVersion"], "requestId": self._operation_id(refs["backendRunId"], "claim")}
        task = self._native(state, save, "store_task_claim", claim, "initial-claim")
        lease = {k: claim[k] for k in ("taskId", "runId", "round")}
        lease.update(expectedVersion=task["taskVersion"], leaseVersion=task["leaseVersion"], leaseToken=identifier(task.get("leaseToken")), requestId=self._operation_id(refs["backendRunId"], "evidence"))
        task = self._native(state, save, "store_task_read_stock_evidence", lease, "initial-evidence")
        evidence = identifier(task.get("evidenceId")); digest = task.get("inputSnapshotHash")
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest): raise Blocked("INVALID_EVIDENCE_HASH")
        state["binding"] = {"taskId": refs["taskId"], "runId": refs["backendRunId"], "round": refs["round"], "expectedVersion": task["taskVersion"], "leaseVersion": lease["leaseVersion"], "leaseToken": lease["leaseToken"], "evidenceId": evidence, "inputSnapshotHash": digest}
        # Store sealed identifiers/hash only, not native inventory facts or reports.
        for op in state["operations"].values():
            op["result"].pop("evidence", None)
        save()

    def _validate_call(self, call, binding):
        if set(call) != {"id", "type", "function"} or call["type"] != "function" or not isinstance(call["id"], str) or not call["id"]:
            raise Blocked("INVALID_TOOL_CALL")
        f = call["function"]
        if set(f) != {"name", "arguments"} or f["name"] not in TOOLS or not isinstance(f["arguments"], str): raise Blocked("TOOL_NOT_ALLOWED")
        args = json.loads(f["arguments"])
        base = {"taskId"} if f["name"] == "store_task_get" else {"requestId", "taskId", "runId", "round", "expectedVersion"}
        if f["name"] in ("store_task_read_stock_evidence", "store_task_report"): base |= {"leaseVersion", "leaseToken"}
        if f["name"] == "store_task_report":
            base |= {"outcome", "rawReport", "sourceRefs"}
            if args.get("outcome") == "completed": base |= {"evidenceId", "inputSnapshotHash"}
            if args.get("outcome") not in ("completed", "blocked", "failed", "unknown") or not isinstance(args.get("rawReport"), str) or not args["rawReport"].strip() or not isinstance(args.get("sourceRefs"), list) or any(not isinstance(x, str) for x in args["sourceRefs"]): raise Blocked("INVALID_REPORT")
        if set(args) != base: raise Blocked("INVALID_NATIVE_TOOL_SCHEMA")
        for k in base & binding.keys():
            if args[k] != binding[k]: raise Blocked("TOOL_BINDING_CHANGED")
        if "requestId" in args: identifier(args["requestId"])
        return args

    @staticmethod
    def _blocked(code):
        # An explicit Hermes program failure, never presented as a MiniMax report/receipt.
        return objectify({"id": "hermes-program-blocked", "object": "chat.completion", "model": "hermes-program", "choices": [{"index": 0, "message": {"role": "assistant", "content": "HERMES_PROGRAM_BLOCKED:" + code, "tool_calls": None}, "finish_reason": "stop"}]})

    def llm_execution(self, *, session_id, base_url=None, next_call=None, **_):
        try:
            if base_url != self.policy.provider_base_url: raise Blocked("RUNTIME_PROVIDER_CHANGED")
            refs = self._state(session_id)
            with self.journal.locked(refs["backendRunId"]) as (s, save):
                try:
                    if s.get("blocked"): return self._blocked(s["blocked"])
                    self._prepare(s, save, refs)
                    if s.get("blocked"): return self._blocked(s["blocked"])
                    responses = s["responses"]
                    if responses:
                        prior = responses[-1]
                        if prior["status"] != "done": raise Blocked("MODEL_OUTCOME_UNKNOWN")
                        calls = prior["response"]["choices"][0]["message"].get("tool_calls") or []
                        if not calls or not all(c["id"] in s.get("toolReceipts", {}) for c in calls): return objectify(prior["response"])
                        if any(c["function"]["name"] == "store_task_report" for c in calls):
                            return self._blocked("REPORT_SUBMITTED_AWAITING_HUMAN_REVIEW")
                    request_id = self._operation_id(refs["backendRunId"], "model:" + str(len(responses)))
                    body = {**s["binding"], "requestId": request_id, "model": MODEL, "stream": False}
                    if responses:
                        body.update(previousRequestId=prior["requestId"], toolResults=[s["toolReceipts"][c["id"]] for c in calls])
                    record = {"requestId": request_id, "bytes": encoded(body), "status": "sending", "binding": copy.deepcopy(s["binding"])}
                    responses.append(record); save()  # uncertain restart never POSTs again
                    self.policy.validate(self.now())
                    self.policy.validate_runtime(self.runtime_settings())
                    response = self.relay(record["bytes"].encode())
                    choice = response["choices"][0]
                    if choice["message"].get("role") != "assistant" or choice["finish_reason"] not in ("stop", "tool_calls"): raise Blocked("INVALID_RELAY_RESPONSE")
                    calls = choice["message"].get("tool_calls") or []
                    if bool(calls) != (choice["finish_reason"] == "tool_calls"): raise Blocked("INVALID_RELAY_RESPONSE")
                    if len({c["id"] for c in calls}) != len(calls): raise Blocked("DUPLICATE_TOOL_CALL")
                    for c in calls: self._validate_call(c, s["binding"])
                    record.update(status="done", response=response); save()
                    return objectify(response)
                except Exception as error:
                    code = str(error) if isinstance(error, Blocked) else "HERMES_EXECUTION_UNKNOWN"
                    s["blocked"] = code; save()
                    return self._blocked(code)
        except Exception:
            return self._blocked("HERMES_PREFLIGHT_REJECTED")

    def tool_execution(self, *, session_id, tool_name, args, tool_call_id=None, next_call=None, **_):
        try:
            refs = self._state(session_id)
            with self.journal.locked(refs["backendRunId"]) as (s, save):
                if s.get("blocked") or not s.get("responses"): raise Blocked("NO_REGISTERED_TOOL_CALL")
                prior = s["responses"][-1]
                calls = prior.get("response", {}).get("choices", [{}])[0].get("message", {}).get("tool_calls", [])
                matches = [c for c in calls if c["id"] == tool_call_id and c["function"]["name"] == tool_name and self._validate_call(c, prior["binding"]) == args]
                # Require the actual relay call ID supplied by Hermes, not just matching text.
                if len(matches) != 1: raise Blocked("UNREGISTERED_TOOL_BYTES")
                call = matches[0]
                try:
                    result = self._native(s, save, tool_name, args, "tool:" + prior["requestId"] + ":" + call["id"])
                except Exception:
                    s["lastProgramError"] = {"code": "NATIVE_OUTCOME_UNKNOWN", "toolCallId": call["id"]}; save()
                    return encoded({"hermesProgram": True, "status": "blocked", "code": "NATIVE_OUTCOME_UNKNOWN"})
                s.pop("lastProgramError", None)
                s["binding"]["expectedVersion"] = max(s["binding"]["expectedVersion"], result["taskVersion"])
                receipt = {"toolCallId": call["id"]}
                if "requestId" in args: receipt["receiptRequestId"] = args["requestId"]
                s.setdefault("toolReceipts", {})[call["id"]] = receipt; save()
                return encoded({"hermesProgram": True, "status": "receipt_recorded", **receipt})
        except Exception:
            return encoded({"hermesProgram": True, "status": "blocked", "code": "HERMES_TOOL_REJECTED"})


def native_tool_schema(name):
    """Exact public MCP schema subset returned by the strict relay; no authVersion."""
    properties = {"taskId": {"type": "string", "format": "uuid"}}
    required = ["taskId"]
    if name != "store_task_get":
        properties.update({"requestId": {"type": "string", "format": "uuid"}, "runId": {"type": "string", "format": "uuid"}, "round": {"type": "integer", "minimum": 1}, "expectedVersion": {"type": "integer", "minimum": 1}})
        required += ["requestId", "runId", "round", "expectedVersion"]
    if name in ("store_task_read_stock_evidence", "store_task_report"):
        properties.update({"leaseVersion": {"type": "integer", "minimum": 1}, "leaseToken": {"type": "string", "format": "uuid"}})
        required += ["leaseVersion", "leaseToken"]
    if name == "store_task_report":
        properties.update({"outcome": {"type": "string", "enum": ["completed", "blocked", "failed", "unknown"]}, "rawReport": {"type": "string", "minLength": 1}, "sourceRefs": {"type": "array", "items": {"type": "string"}}, "evidenceId": {"type": "string", "format": "uuid"}, "inputSnapshotHash": {"type": "string", "pattern": "^[a-f0-9]{64}$"}})
        required += ["outcome", "rawReport", "sourceRefs"]
    return {"name": name, "description": "Execute only the registered strict-relay call. Report remains unverified.", "parameters": {"type": "object", "properties": properties, "required": required, "additionalProperties": False}}


def denied_tool_handler(args, **_):
    return encoded({"error": "PDCA_BRIDGE_REQUIRED", "hermesProgram": True, "status": "blocked"})


def register_bridge(ctx, bridge):
    """Official Hermes plugin seams; bootstrap must verify actual runtime settings first."""
    bridge.policy.validate(bridge.now())
    bridge.policy.validate_runtime(bridge.runtime_settings())
    # Recognition happens before execution middleware. Register exact aliases, never wildcard.
    for name in sorted(TOOLS):
        handle = ctx.register_tool(name=name, toolset="pdca_executor_only", schema=native_tool_schema(name), handler=denied_tool_handler)
        if handle is None: raise Blocked("TOOL_ALIAS_REGISTRATION_REJECTED")
    ctx.register_hook("pre_llm_call", bridge.capture)
    ctx.register_middleware("llm_execution", bridge.llm_execution)
    ctx.register_middleware("tool_execution", bridge.tool_execution)


def register(ctx):
    """Official discovery entry, bootstrapped through an explicitly configured private file.

    The file exports build_bridge(ctx), wiring the dedicated credential broker and raw
    SDK session. It is trusted operator code just like the plugin itself, never prompt
    input. No ambient Python object, profile/secret discovery or import side effect.
    """
    if ctx.profile_name in ("", "default"): raise Blocked("DEDICATED_PROFILE_REQUIRED")
    filename = ctx.get_config("bootstrap_file")
    if not isinstance(filename, str) or not os.path.isabs(filename) or not filename.endswith(".py"):
        raise Blocked("DEDICATED_BOOTSTRAP_REQUIRED")
    parent = Path(filename).parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid() or parent.st_mode & 0o077:
        raise Blocked("UNSAFE_BOOTSTRAP_DIRECTORY")
    fd = os.open(filename, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        Journal._private(fd)
        with os.fdopen(os.dup(fd)) as stream: source = stream.read(100001)
        if len(source) > 100000: raise Blocked("BOOTSTRAP_TOO_LARGE")
    finally:
        os.close(fd)
    module = types.ModuleType("pdca_dedicated_bootstrap")
    module.__file__ = filename
    exec(compile(source, filename, "exec"), module.__dict__)
    factory = getattr(module, "build_bridge", None)
    if not callable(factory): raise Blocked("BOOTSTRAP_FACTORY_REQUIRED")
    bridge = factory(ctx)
    if not isinstance(bridge, Bridge) or bridge.policy.profile != ctx.profile_name:
        raise Blocked("BOOTSTRAP_PROFILE_CHANGED")
    register_bridge(ctx, bridge)
