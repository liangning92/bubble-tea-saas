"""Actual Hermes execution capture. No default-profile reads, self-issued proof or send path.

The trusted host owns source ACL, execution allocation, trace persistence and output admission.
This module returns raw observations, never an allow decision. Run in a fresh child process
with an empty HOME. Test transports are injected beneath the real OpenAI SDK serialization.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import sys
import subprocess
import threading
from dataclasses import dataclass
from typing import Callable
import types


def digest(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def normalize_schema(value):
    """Key-sorted JSON form. JSON Schema treats an empty required list exactly like an
    absent one and the model SDK omits it, so that difference is normalized away."""
    if isinstance(value, dict):
        result = {}
        for key in sorted(value):
            if key == "required" and isinstance(value[key], list) and not value[key]:
                continue
            result[key] = normalize_schema(value[key])
        return result
    if isinstance(value, list):
        return [normalize_schema(item) for item in value]
    return value


def canonical_tools(tools):
    """The issued tool surface is a set of name+schema, not a sequence. The runtime may
    emit the same backend-issued tools in another order and with its own JSON key order;
    only a different surface is a violation. Names are unique, so the order is total."""
    items = [normalize_schema(tool) for tool in (tools or [])]
    return sorted(items, key=lambda tool: str((tool.get("function") or {}).get("name", "")))


def canonical_tools_digest(tools) -> str:
    return digest(json.dumps(canonical_tools(tools), ensure_ascii=False, separators=(",", ":")))


@dataclass(frozen=True)
class AuthorizedToolResult:
    """Internal trusted-host receipt, never parsed from a model/tool JSON body."""
    value: object
    sources: list
    trace_version: int


class RuntimeEnvironment:
    """Permanent child-only fence installed BEFORE importing Hermes or its loaders.

    Explicit pipe config is the sole credential/routing source. A no-I/O loader
    replaces source/profile/managed dotenv and external-secret hydration. The
    audit fence catches bypasses; boundary checks also catch direct mapping swaps.
    """
    def __init__(self, profile: Path, home: Path, session: str):
        self.profile, self.home, self.session = profile, home, session
        self.environ = os.environ
        self.baseline = dict(os.environ)
        self.tainted = False
        self.reason = None
        self.repairing = False
        sys.addaudithook(self.audit)
        loader = types.ModuleType("hermes_cli.env_loader")
        loader.__file__ = __file__
        loader.load_hermes_dotenv = lambda **kwargs: []
        loader.hydrate_profile_secret_sources = lambda *args, **kwargs: {}
        loader.get_secret_source_values = lambda *args, **kwargs: {}
        loader.get_secret_source = lambda *args, **kwargs: None
        loader.reset_secret_source_cache = lambda *args, **kwargs: None
        loader.format_secret_source_suffix = lambda *args, **kwargs: ""
        self.loader = loader
        sys.modules["hermes_cli.env_loader"] = loader
        package = types.ModuleType("agent.secret_sources")
        package.__path__ = []
        registry = types.ModuleType("agent.secret_sources.registry")
        registry.list_plugin_sources = lambda: []  # plugin discovery metadata, no sources
        registry.get_source = lambda *args, **kwargs: None
        def deny_source(*args, **kwargs):
            self.tainted = True
            raise PermissionError("EMPLOYEE_EXTERNAL_SECRET_SOURCE_DENIED")
        registry.apply_all = deny_source
        registry.register_source = deny_source
        package.registry = registry
        self.source_modules = {"agent.secret_sources": package, "agent.secret_sources.registry": registry}
        sys.modules.update(self.source_modules)

    def audit(self, event, args):
        def text(value):
            return os.fsdecode(value) if isinstance(value, (bytes, str)) else ""
        if event in {"os.putenv", "os.unsetenv"} and not self.repairing:
            key = text(args[0])
            if event == "os.putenv":
                value = text(args[1])
                if key == "HERMES_SESSION_ID" and value == self.session:
                    return
                if key in self.baseline and value == self.baseline[key]:
                    return
            elif key == "HERMES_SESSION_ID":
                return
            self.tainted = True
            self.reason = 'EMPLOYEE_ENV_MUTATION_' + (key if re.fullmatch(r'[A-Z0-9_]{1,60}',key) else 'UNKNOWN_KEY')
            raise PermissionError("EMPLOYEE_ENVIRONMENT_MUTATION_DENIED")
        if event == "open" and args and isinstance(args[0], (str, bytes)):
            path = Path(text(args[0]))
            name = path.name
            secret = name.endswith(".env") or name.startswith(".env.") or name in {"auth.json", "credentials.json"}
            shared_config = name == "config.yaml" and not path.resolve().is_relative_to(self.profile)
            if secret or shared_config:
                self.tainted = True
                self.reason = 'EMPLOYEE_SHARED_CONFIGURATION_READ_DENIED'
                raise PermissionError("EMPLOYEE_SHARED_CONFIGURATION_READ_DENIED")
        if event == "import" and args and str(args[0]).startswith("agent.secret_sources"):
            self.tainted = True
            raise PermissionError("EMPLOYEE_EXTERNAL_SECRET_SOURCE_DENIED")

    def restore(self):
        self.repairing = True
        try:
            os.environ = self.environ
            self.environ.clear()
            self.environ.update(self.baseline)
        finally:
            self.repairing = False

    def pin_terminal_defaults(self, target):
        # Hermes mirrors public terminal defaults on its first tool call, even
        # for non-terminal tools. Freeze those same defaults before execution;
        # no inherited/user config or later backend/permission switch is allowed.
        if any(k not in self.baseline and not k.startswith("TERMINAL_") for k in target):
            raise RuntimeError("UNEXPECTED_TERMINAL_DEFAULTS")
        self.baseline = dict(target)
        self.restore()

    def check(self):
        current = dict(os.environ)
        expected = dict(self.baseline)
        if "HERMES_SESSION_ID" in current:
            expected["HERMES_SESSION_ID"] = self.session
        valid = os.environ is self.environ and current == expected and sys.modules.get("hermes_cli.env_loader") is self.loader
        valid = valid and all(sys.modules.get(name) is module for name, module in self.source_modules.items())
        if valid and "hermes_constants" in sys.modules:
            valid = sys.modules["hermes_constants"].get_hermes_home().resolve() == self.profile
        if self.tainted or not valid:
            self.tainted = True
            if not self.reason:
                self.reason = 'EMPLOYEE_ENVIRONMENT_INTEGRITY_FAILED'
            self.restore()  # keep shutdown/cleanup inside the original compartment too
            raise RuntimeError("EMPLOYEE_ENVIRONMENT_INTEGRITY_FAILED")


def run_employee(context: dict, *, provider_send: Callable, tool_execute: Callable, response_observed: Callable | None = None) -> dict:
    """One fresh process / execution / compartment. Input context comes from trusted host.

    provider_send receives an actual httpx.Request, not a synthesized model payload.
    tool_execute receives a registered tool invocation and returns its actual JSON result.
    Both must be trusted host adapters. Neither is configurable from model/tool bodies.
    """
    if context.get("purpose") != "employee_work" or context.get("memoryNamespace") != context.get("compartmentKey"):
        raise ValueError("EMPLOYEE_CONTEXT_REQUIRED")
    key = context.get("compartmentKey", "")
    execution = context.get("executionId", "")
    if not re.fullmatch(r"[a-f0-9]{64}", key) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", execution):
        raise ValueError("INVALID_EXECUTION")
    # Never accept a session/profile/history chosen by a model or reuse stock/manager memory.
    if any(field in context for field in ("sessionId", "profile", "conversation_history", "prefill_messages", "proof")):
        raise ValueError("CALLER_SESSION_OR_PROOF_FORBIDDEN")
    root = Path(context["isolatedRoot"])
    if not root.is_absolute() or root.is_symlink() or root.resolve() != root:
        raise ValueError("ISOLATED_ROOT_REQUIRED")
    home = Path(os.environ.get("HOME", ""))
    if not home.is_absolute() or home.resolve() != home or not home.is_relative_to(root):
        raise ValueError("FRESH_HOME_REQUIRED")
    if any(home.iterdir()):
        raise ValueError("HOME_MUST_BE_EMPTY")
    if any(name not in {"HOME", "PATH", "PYTHONDONTWRITEBYTECODE", "PYTHONUNBUFFERED", "NO_PROXY", "LANG"} for name in os.environ):
        raise ValueError("UNSANITIZED_ENVIRONMENT")
    isolation = context.get("ticketIsolation")
    if isolation is not None:
        if (isolation.get("protocol") != "employee_work_trace_v1"
                or isolation.get("compartmentKey") != key or isolation.get("memoryNamespace") != key
                or isolation.get("profile") != "employee_work"
                or not re.fullmatch(r"employee_work_[a-f0-9]{64}", isolation.get("sessionId", ""))
                or any(isolation.get(flag) is not False for flag in ("memoryEnabled", "contextFilesEnabled", "auxiliaryModelsEnabled", "sharedHistoryEnabled", "builtinToolsEnabled"))):
            raise ValueError("INVALID_TICKET_ISOLATION")
    profile_name = "employee_work"
    profile = root / "executions" / digest(execution) / "profiles" / profile_name
    profile.mkdir(parents=True, mode=0o700, exist_ok=False)  # one-use even after crash/restart
    # Pinned Hermes otherwise replaces custom tools with tool_search/describe/call.
    # Keep the actual SDK catalog identical to the backend-issued tools; this is
    # a new private profile, never the user's default or stock profile.
    config_path = profile / "config.yaml"
    with config_path.open('x', encoding='utf-8') as config_file:
        os.chmod(config_path, 0o600)
        config_file.write('tools:\n  tool_search:\n    enabled: "off"\n')
    os.environ["HERMES_HOME"] = str(profile)
    os.chdir(home)
    session = isolation["sessionId"] if isolation else "employee_work_" + digest(key + ":" + execution)
    (root / "used_sessions" / session).mkdir(parents=True, mode=0o700, exist_ok=False)
    source = Path(context["hermesSource"])
    if not source.is_absolute() or source.resolve() != source or not (source / "run_agent.py").is_file():
        raise ValueError("HERMES_SOURCE_REQUIRED")
    sha = context.get("hermesExpectedSha", "")
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("PINNED_HERMES_SHA_REQUIRED")
    actual_sha = subprocess.check_output(["/usr/bin/git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
    if actual_sha != sha:
        raise ValueError("HERMES_SOURCE_CHANGED")
    if any(name in sys.modules for name in ("run_agent", "model_tools", "hermes_cli.config")):
        raise ValueError("FRESH_HERMES_PROCESS_REQUIRED")
    environment = RuntimeEnvironment(profile, home, session)
    sys.path.insert(0, str(source))
    import httpx

    observed = {"executionId": execution, "compartmentKey": key, "purpose": "employee_work",
                "memoryNamespace": key, "sessionId": session, "profilePath": str(profile), "profile": profile_name,
                "hermesSha": actual_sha,
                "modelRequests": [], "modelResponses": [], "toolEvents": [], "output": None, "outputHash": None,
                "complete": False, "captureFailures": [], "blockedMetadataRequests": []}
    # No truncation: if capture cannot preserve all bytes, the execution fails closed.
    max_bytes = context.get("maxTraceBytes", 4_000_000)
    total = 0
    capture_failed = False
    trace_lock = threading.RLock()
    tool_lock = threading.RLock()
    provider_url = context["providerBaseUrl"].rstrip("/") + "/chat/completions"
    from urllib.parse import urlsplit
    parsed = urlsplit(context["providerBaseUrl"])
    if (parsed.username or parsed.password or parsed.query or parsed.fragment
            or not (parsed.scheme == "https" or parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"})):
        raise ValueError("EXPLICIT_SAFE_PROVIDER_ENDPOINT_REQUIRED")
    original_send = httpx.Client.send
    original_async_send = httpx.AsyncClient.send

    def observe_response(response, ordinal):
        nonlocal capture_failed
        def finish(chunks):
            raw = b"".join(chunks).decode("utf-8")
            value = retain({"requestOrdinal": ordinal, "body": raw, "bodyHash": digest(raw),
                            "contentType": response.headers.get("content-type", ""), "httpStatus": response.status_code})
            observed["modelResponses"].append(value)
            if response_observed is not None:
                response_observed(value)  # persisted before a model-requested tool may execute
        if response.is_stream_consumed:
            try: finish([response.content])
            except Exception:
                capture_failed = True
                raise
        else:
            stream = response.stream
            class CapturedStream(httpx.SyncByteStream):
                def __iter__(self):
                    nonlocal capture_failed
                    chunks = []
                    size = 0
                    response_recorded = False
                    try:
                        for chunk in stream:
                            chunks.append(chunk)
                            size += len(chunk)
                            if size > max_bytes:
                                raise RuntimeError("INCOMPLETE_RUNTIME_CAPTURE")
                        # The SDK stops iteration as soon as it sees [DONE], so
                        # post-yield recording can be skipped on a real socket.
                        # Preserve/authorize the COMPLETE response before any
                        # tool-bearing bytes become visible to Hermes.
                        finish(chunks)
                        response_recorded = True
                        yield from chunks
                    except BaseException:
                        # SDK generator close after [DONE] is expected once the
                        # entire response was already recorded above.
                        if not response_recorded:
                            capture_failed = True
                        raise
                def close(self):
                    stream.close()
            response.stream = CapturedStream()
        return response

    def retain(value):
        nonlocal total, capture_failed
        wire = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        with trace_lock:
            total += len(wire.encode())
            if total > max_bytes:
                capture_failed = True
                raise RuntimeError("INCOMPLETE_RUNTIME_CAPTURE")
        return json.loads(wire)

    def capture_send(client, request, **kwargs):
        nonlocal capture_failed
        try:
            environment.check()
        except Exception:
            observed["captureFailures"].append({"code": environment.reason or "EMPLOYEE_ENVIRONMENT_INTEGRITY_FAILED"})
            raise
        if str(request.url) != provider_url:
            # Hermes probes local provider metadata while resolving context length. Block
            # these without forwarding a byte; they contain only the configured model ID.
            paths = {"/api/v1/models", "/api/tags", "/v1/props", "/props", "/version", "/v1/models", "/v1/models/" + context["model"], "/api/show"}
            # The backend relay is mounted below /api/internal/employee-hermes/v1,
            # not at the origin root. Match only these exact metadata suffixes under
            # the trusted relay prefix; never forward metadata or relax provider URL checks.
            from urllib.parse import urlsplit
            base = urlsplit(context["providerBaseUrl"])
            prefix = base.path.rstrip("/")
            if prefix.endswith("/v1"):
                prefix = prefix[:-3]
            relay_paths = paths | {prefix + path for path in paths}
            same_origin = (request.url.scheme, request.url.host, request.url.port or (443 if request.url.scheme == "https" else 80)) == (base.scheme, base.hostname, base.port or (443 if base.scheme == "https" else 80))
            if request.url.path in relay_paths and same_origin:
                metadata = json.loads(request.content) if request.content else {}
                if isinstance(metadata, dict) and set(metadata) <= {"model", "name"} and all(v == context["model"] for v in metadata.values()):
                    observed["blockedMetadataRequests"].append(retain({"path": request.url.path, "body": metadata}))
                    return httpx.Response(404, json={"error": "metadata_disabled"}, request=request)
            capture_failed = True
            observed["captureFailures"].append({"code": "UNEXPECTED_PROVIDER_DESTINATION", "host": request.url.host, "path": request.url.path})
            raise RuntimeError("UNEXPECTED_PROVIDER_DESTINATION")
        try:
            raw = request.content.decode("utf-8")
            actual = json.loads(raw)
            if actual.get("model") != context["model"]:
                raise RuntimeError("EMPLOYEE_MODEL_ROUTE_CHANGED")
            names = [entry["function"]["name"] for entry in actual.get("tools", [])]
            if set(names) != set(context["tools"]):
                raise RuntimeError("UNEXPECTED_MODEL_TOOL_SURFACE")
            observed["modelRequests"].append(retain({"body": raw, "bodyHash": digest(raw)}))
            kwargs["follow_redirects"] = False  # never forward employee context to another endpoint
            response = provider_send(client, request, **kwargs)
            environment.check()
            return observe_response(response, len(observed["modelRequests"]))
        except Exception as error:
            capture_failed = True
            code = str(error)
            observed["captureFailures"].append({"code": code if re.fullmatch(r"[A-Z0-9_]{1,100}",code) else 'EMPLOYEE_PROVIDER_' + type(error).__name__.upper()})
            raise

    async def deny_unobserved_async(*args, **kwargs):
        nonlocal capture_failed
        capture_failed = True
        observed["captureFailures"].append({"code": "UNOBSERVED_ASYNC_PROVIDER_FORBIDDEN"})
        raise RuntimeError("UNOBSERVED_ASYNC_PROVIDER_FORBIDDEN")

    httpx.Client.send = capture_send
    httpx.AsyncClient.send = deny_unobserved_async
    agent = None
    try:
        from run_agent import AIAgent
        from tools.registry import registry
        environment.check()
        from hermes_cli import config as hermes_config
        from tools.tool_search import load_config as tool_search_config
        if tool_search_config().enabled != "off":
            raise RuntimeError("EMPLOYEE_TOOL_SEARCH_MUST_BE_OFF")
        terminal_defaults = dict(environment.baseline)
        hermes_config.apply_terminal_config_to_env(env=terminal_defaults,
            config={"terminal": hermes_config.DEFAULT_CONFIG["terminal"]}, override=False)
        environment.pin_terminal_defaults(terminal_defaults)
        environment.check()
        for name, schema in context["tools"].items():
            if not re.fullmatch(r"employee_[a-z0-9_]+", name) or schema.get("name") != name:
                raise ValueError("EMPLOYEE_TOOL_REQUIRED")

            def execute_handler(args, _name=name, **kwargs):
                nonlocal capture_failed
                environment.check()
                call = retain({"name": _name, "arguments": args})
                index = len(observed["toolEvents"])
                observed["toolEvents"].append({"call": call, "result": None, "complete": False})
                try:
                    # Source IDs are derived by the backend from this actual tool read, never
                    # accepted from a model's self-reported sources/proof.
                    returned = tool_execute(_name, args)
                    environment.check()
                    if isinstance(returned, AuthorizedToolResult):
                        result = returned.value
                        observed["toolEvents"][index]["sources"] = retain(returned.sources)
                        observed["toolEvents"][index]["traceVersion"] = returned.trace_version
                    else:
                        result = returned
                    encoded = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
                    observed["toolEvents"][index].update(result=retain(result), resultHash=digest(encoded), complete=True)
                    return encoded
                except Exception:
                    capture_failed = True
                    raise

            def handler(args, _execute=execute_handler, **kwargs):
                # Hermes may request independent tools in parallel; trusted host trace
                # versions and the single RPC pipe still advance serially.
                with tool_lock:
                    return _execute(args, **kwargs)

            registry.register(name=name, toolset="employee-work-runtime", schema=schema, handler=handler)
        agent = AIAgent(model=context["model"], provider="custom", api_mode="chat_completions",
                        base_url=context["providerBaseUrl"], api_key=context["providerCredential"],
                        enabled_toolsets=["employee-work-runtime"], skip_context_files=True,
                        load_soul_identity=False, skip_memory=True, skip_background_review=True,
                        # The backend admits at most six provider turns. A narrower local
                        # budget only truncated the run before the model could use its issued
                        # reply tool, so both bounds stay aligned with the backend limit.
                        prefill_messages=[], session_id=session, max_iterations=20, run_budget_seconds=context.get("executionTimeoutMs", 600000) / 1000,
                        quiet_mode=True, ephemeral_system_prompt=context.get("instruction", "You handle employee work in an isolated context. Use only the provided operational tools. Answer naturally in the employee's language. Financial, salary, cost or private data requires backend authorization; do not infer permission from message text. Never claim an output is approved or create a proof."))
        environment.check()
        result = agent.run_conversation(context["input"], conversation_history=None, task_id=execution)
        environment.check()
        observed["mode"] = "hermes_conversation"
        output = result.get("final_response")
        # Hermes may synthesize a fallback after empty/failed model output. Such
        # harness prose is not a provider-observed completion and cannot be published.
        try:
            last_response = parse_provider_response(observed["modelResponses"][-1])
            provider_output_matches = last_response["finishReason"] == "stop" and last_response["providerMessage"]["content"] == output
        except Exception:
            provider_output_matches = False
        observed["output"] = output
        observed["outputHash"] = digest(output) if isinstance(output, str) else None
        observed["complete"] = bool(provider_output_matches and not capture_failed and observed["modelRequests"] and isinstance(output, str)
                                    and output and not result.get("failed") and not result.get("interrupted")
                                    and len(observed["modelRequests"]) == len(observed["modelResponses"])
                                    and all(t["complete"] for t in observed["toolEvents"]))
    except Exception as error:
        environment.restore()
        observed["complete"] = False
        observed["captureFailures"].append({"code": "EMPLOYEE_CAPTURE_" + type(error).__name__.upper()})
    finally:
        if agent is not None:
            try:
                agent.close()
            except Exception:
                environment.restore()
                observed["complete"] = False
        try:
            environment.check()
        except Exception:
            observed["complete"] = False
        httpx.Client.send = original_send
        httpx.AsyncClient.send = original_async_send
        if environment.reason:
            observed["captureFailures"].append({"code": environment.reason})
    return observed


def parse_provider_response(record: dict) -> dict:
    """Parse only a complete actual provider response. No model-declared proof fields."""
    if record["httpStatus"] != 200:
        raise ValueError("PROVIDER_RESPONSE_FAILED")
    if "text/event-stream" not in record["contentType"]:
        data = json.loads(record["body"])
        choice = data["choices"][0]
        return {"providerRequestId": data["id"], "finishReason": choice["finish_reason"],
                "providerMessage": choice["message"]}
    content, tool_calls, request_id, finish, done = "", {}, None, None, False
    for line in record["body"].splitlines():
        if not line.startswith("data:"):
            continue
        text = line[5:].strip()
        if text == "[DONE]":
            done = True
            continue
        data = json.loads(text)
        request_id = data.get("id", request_id)
        for choice in data.get("choices", []):
            if choice.get("index") != 0:
                raise ValueError("MULTIPLE_PROVIDER_CHOICES_FORBIDDEN")
            delta = choice.get("delta", {})
            content += delta.get("content") or ""
            if choice.get("finish_reason"):
                finish = choice["finish_reason"]
            for call in delta.get("tool_calls", []):
                value = tool_calls.setdefault(call["index"], {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                if call.get("id"): value["id"] += call["id"]
                value["function"]["name"] += call.get("function", {}).get("name", "")
                value["function"]["arguments"] += call.get("function", {}).get("arguments", "")
    if not done or finish not in {"stop", "tool_calls"} or not request_id:
        raise ValueError("INCOMPLETE_PROVIDER_RESPONSE")
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = [tool_calls[i] for i in sorted(tool_calls)]
    return {"providerRequestId": request_id, "finishReason": finish, "providerMessage": message}


def run_ticket(ticket: dict, config: dict, port, *, provider_send: Callable) -> dict:
    """Current multi-round EmployeeRuntimeHostPort; real Hermes conversation loop."""
    if ticket.get("protocol") != "employee_work_trace_v1" or ticket["isolation"]["profile"] != "employee_work":
        raise ValueError("INVALID_MULTITURN_RUNTIME_TICKET")
    execution, version, turn = ticket["executionId"], ticket["traceVersion"], 0
    phase, pending, final = "input_ready", [], None
    # A model may request several tools in one round and the runtime may dispatch
    # them on separate threads. The trusted port is one framed pipe with one trace
    # version, so every frame and every state change has to be serialized here.
    trace = threading.RLock()

    def checked_send(client, request, **kwargs):
        nonlocal version, turn, phase
        with trace:
            if phase != "input_ready":
                raise RuntimeError("REPEATED_OR_UNRECORDED_PROVIDER_TURN")
            actual = json.loads(request.content)
            phase = "awaiting_response"  # retry can never become a new turn
            # The ticket must still describe exactly its own issued surface. The canonical
            # form is authoritative; the legacy raw form is accepted for a ticket that was
            # issued before the comparison became order independent.
            if ticket["toolSchemaHash"] not in (canonical_tools_digest(ticket["tools"]), digest(json.dumps(ticket["tools"], ensure_ascii=False, separators=(",", ":")))):
                raise RuntimeError("TICKET_TOOL_SCHEMA_HASH_MISMATCH")
            # Compare the actual tool surface as a set. The runtime is free to order the
            # issued tools differently; it is not free to change, add or drop one.
            actual_tool_hash = canonical_tools_digest(actual.get("tools", []))
            if canonical_tools(actual.get("tools", [])) != canonical_tools(ticket["tools"]) or actual_tool_hash != canonical_tools_digest(ticket["tools"]):
                raise RuntimeError("ACTUAL_TOOL_SCHEMA_MISMATCH")
            turn += 1
            wire_hash = digest(json.dumps(actual, ensure_ascii=False, separators=(",", ":")))
            admitted = port.recordInput({"executionId": execution, "expectedTraceVersion": version, "turn": turn,
                "inputHash": wire_hash, "toolSchemaHash": actual_tool_hash,
                "isolation": ticket["isolation"], "providerRequest": actual})
            version = admitted["traceVersion"]
            if admitted.get("maySend") is not True:
                raise RuntimeError("RUNTIME_INPUT_NOT_ADMITTED")
            return provider_send(client, request, **kwargs)

    def response_seen(record):
        nonlocal version, phase, pending, final
        with trace:
            if phase != "awaiting_response" or record["requestOrdinal"] != turn:
                raise RuntimeError("UNEXPECTED_PROVIDER_RESPONSE")
            parsed = parse_provider_response(record)
            # Preserve the complete real receipt before local rejection. A blocked
            # tool call is not permission to discard its provider ID or resend it.
            receipt = port.recordResponse({"executionId": execution, "expectedTraceVersion": version, "turn": turn, **parsed})
            version = receipt["traceVersion"]
            calls = parsed["providerMessage"].get("tool_calls", [])
            if (len({call.get("id") for call in calls}) != len(calls)
                    or any(not call.get("id") or call.get("type") != "function"
                        or call["function"]["name"] not in tools
                        or not isinstance(json.loads(call["function"]["arguments"]), dict) for call in calls)):
                raise RuntimeError("UNISSUED_MODEL_TOOL_CALL")
            pending = [{"ordinal": i, "call": call} for i, call in enumerate(parsed["providerMessage"].get("tool_calls", []))]
            if parsed["finishReason"] == "tool_calls" and pending:
                phase = "tools_pending"
            elif parsed["finishReason"] == "stop" and not pending:
                phase, final = "final", parsed
            else:
                raise RuntimeError("RESPONSE_FINISH_REASON_MISMATCH")

    def execute(name, args):
        nonlocal version, phase
        with trace:
            if phase != "tools_pending":
                raise RuntimeError("UNRECORDED_MODEL_TOOL_CALL")
            match = next((item for item in pending if item["call"]["function"]["name"] == name
                and json.loads(item["call"]["function"]["arguments"]) == args), None)
            if match is None:
                raise RuntimeError("MODEL_TOOL_CALL_MISMATCH")
            call = match["call"]
            receipt = port.executeTool({"executionId": execution, "expectedTraceVersion": version, "turn": turn,
                "callOrdinal": match["ordinal"], "toolCallId": call["id"], "name": name, "args": args})
            version = receipt["traceVersion"]
            # Mainline stores immutable value+sources before returning. Do not permit
            # model args to choose sources; only the exact authorized value enters Hermes.
            if "sources" not in receipt or "value" not in receipt:
                raise RuntimeError("TRUSTED_TOOL_RECEIPT_REQUIRED")
            pending.remove(match)
            if not pending: phase = "input_ready"
            return AuthorizedToolResult(receipt["value"], receipt["sources"], version)

    tools = {item["function"]["name"]: item["function"] for item in ticket["tools"]}
    context = {**config, "purpose": "employee_work", "executionId": execution,
        "compartmentKey": ticket["compartmentKey"], "memoryNamespace": ticket["compartmentKey"],
        "ticketIsolation": ticket["isolation"], "input": ticket["sealedUserContent"], "instruction": ticket["instruction"], "executionTimeoutMs": ticket.get("executionTimeoutMs", 600000),
        "model": ticket["model"], "tools": tools}
    try:
        observation = run_employee(context, provider_send=checked_send, tool_execute=execute, response_observed=response_seen)
        if not observation["complete"] or phase != "final" or pending or not final:
            raise RuntimeError("INCOMPLETE_MULTITURN_EXECUTION")
        if observation["output"] != final["providerMessage"]["content"]:
            raise RuntimeError("FINAL_MODEL_OUTPUT_MISMATCH")
        stored = port.recordOutput({"executionId": execution, "expectedTraceVersion": version,
            "providerRequestId": final["providerRequestId"], "providerMessage": {"role": "assistant", "content": observation["output"]}})
        return {"observation": observation, "stored": stored}
    except Exception:
        phase = "unknown"
        failures = observation.get("captureFailures", []) if "observation" in locals() else []
        # The first failure is the cause; a later one (a retry blocked by the already
        # reserved turn) is only a consequence. Report the cause, not the consequence.
        code = failures[0].get("code", "EMPLOYEE_RUNTIME_UNCONFIRMED") if failures else "EMPLOYEE_RUNTIME_UNCONFIRMED"
        port.markUnknown(execution, version, code if re.fullmatch(r"[A-Z0-9_]{1,100}", code) else "EMPLOYEE_RUNTIME_UNCONFIRMED")
        return {"unknown": True, "executionId": execution}
