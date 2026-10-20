"""Synthetic only: no network, Hermes initialization, profile or credential discovery."""
import copy
import ast
import asyncio
import types
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import uuid
from dataclasses import replace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pdca_bridge import Bridge, Blocked, Journal, ProfilePolicy, TOOLS, SCOPES, RawMcpSession, RelayHttp, encoded, register_bridge, register


def uid(n): return str(uuid.UUID(int=n))
NOW = 1800000000
# Relative synthetic timestamps, never a real pilot.
from datetime import datetime, timezone
PILOT = {"id": uid(9), "startedAt": datetime.fromtimestamp(NOW - 10, timezone.utc).isoformat(), "expiresAt": datetime.fromtimestamp(NOW - 10 + 86400, timezone.utc).isoformat()}
REFS = json.loads((Path(__file__).parent / "fixtures/dispatch.json").read_text())["references"]
RUNTIME = {"profile": "pdca-test", "base_url": "https://store.invalid/agent-model/v1", "api_key": "pdca-raw-provider-denied", "fallback_providers": [], "enabled_tools": sorted(TOOLS), "executor_scopes": sorted(SCOPES), "auxiliary_models_enabled": False, "memory_enabled": False, "compression_enabled": False}
POLICY = ProfilePolicy("pdca-test", "https://store.invalid", "https://store.invalid/agent-model/v1", "pdca-raw-provider-denied", (), TOOLS, SCOPES, PILOT)


class Fixture:
    def __init__(self, directory):
        self.directory, self.calls, self.relay_calls = directory, [], []
        self.receipts = {}
        self.task = {"taskId": uid(1), "taskCode": "STOCK-RO-001", "runId": uid(2), "round": 1, "executorId": uid(4), "taskVersion": 1, "leaseVersion": 0, "state": "assigned"}
        self.answer = self.completion()
        self.bridge = self.new_bridge()
        self.capture()

    def new_bridge(self): return Bridge(POLICY, self.directory, self.mcp, self.relay, runtime_settings=lambda: copy.deepcopy(RUNTIME), now=lambda: NOW)
    def capture(self, bridge=None, refs=None): (bridge or self.bridge).capture(session_id="session", user_message=encoded({"schemaVersion": 1, "references": refs or REFS}))
    def llm(self, bridge=None): return (bridge or self.bridge).llm_execution(session_id="session", base_url=POLICY.provider_base_url, request={"messages": [{"role": "user", "content": "private ignored"}]}, next_call=lambda _: self.fail_fallback())
    @staticmethod
    def fail_fallback(): raise AssertionError("must never invoke normal provider")
    @staticmethod
    def completion(calls=None):
        return {"id": "synthetic-relay-receipt", "object": "chat.completion", "model": "MiniMax-M3.1-Flash", "choices": [{"index": 0, "message": {"role": "assistant", "content": None if calls else "Synthetic read-only report", **({"tool_calls": calls} if calls else {})}, "finish_reason": "tool_calls" if calls else "stop"}]}
    def relay(self, wire):
        self.relay_calls.append(wire)
        data = json.loads(Path(self.directory, uid(2) + ".json").read_text())
        assert data["responses"][-1]["status"] == "sending"
        return copy.deepcopy(self.answer)
    def mcp(self, name, args):
        self.calls.append((name, copy.deepcopy(args)))
        data = json.loads(Path(self.directory, uid(2) + ".json").read_text())
        assert any(v["bytes"] == encoded(args) for v in data["operations"].values())
        if args.get("requestId") in self.receipts: return copy.deepcopy(self.receipts[args["requestId"]])
        if name != "store_task_get":
            assert args["expectedVersion"] == self.task["taskVersion"]
            if name == "store_task_claim": self.task.update(state="running", leaseVersion=1, leaseToken=uid(5))
            if name == "store_task_read_stock_evidence": self.task.update(evidenceId=uid(6), inputSnapshotHash="a" * 64, evidence={"synthetic": "sealed-facts"})
            if name == "store_task_report": self.task.update(state="awaiting_review", report={"id": uid(8), "rawReport": args["rawReport"]})
            self.task["taskVersion"] += 1
        result = {"content": [{"type": "text", "text": "untrusted truncated display"}], "structuredContent": {"task": copy.deepcopy(self.task)}}
        if "requestId" in args: self.receipts[args["requestId"]] = copy.deepcopy(result)
        return result
    def call(self, name, call_id="call-1", **extras):
        binding = {"taskId": uid(1), "runId": uid(2), "round": 1, "expectedVersion": 3, "leaseVersion": 1, "leaseToken": uid(5), "evidenceId": uid(6), "inputSnapshotHash": "a" * 64}
        args = {"taskId": uid(1)} if name == "store_task_get" else {k: binding[k] for k in ("taskId", "runId", "round", "expectedVersion")}
        if name != "store_task_get": args["requestId"] = uid(20)
        if name in ("store_task_read_stock_evidence", "store_task_report"): args.update({k: binding[k] for k in ("leaseVersion", "leaseToken")})
        if name == "store_task_report": args.update(evidenceId=uid(6), inputSnapshotHash="a" * 64, outcome="completed", rawReport="Synthetic unverified report", sourceRefs=["source-1"])
        args.update(extras)
        return {"id": call_id, "type": "function", "function": {"name": name, "arguments": encoded(args)}}
    def execute(self, call, bridge=None):
        return json.loads((bridge or self.bridge).tool_execution(session_id="session", tool_name=call["function"]["name"], tool_call_id=call["id"], args=json.loads(call["function"]["arguments"]), next_call=lambda _: self.fail_fallback()))


class BridgeTests(unittest.TestCase):
    def setUp(self): self.temp = tempfile.TemporaryDirectory(); self.f = Fixture(self.temp.name)
    def tearDown(self): self.temp.cleanup()
    def test_preflight_native_order_and_no_prompt_or_auth_in_relay(self):
        self.f.llm()
        self.assertEqual([c[0] for c in self.f.calls], ["store_task_get", "store_task_claim", "store_task_read_stock_evidence"])
        body = json.loads(self.f.relay_calls[0])
        self.assertEqual(body["expectedVersion"], 3)
        self.assertEqual(body["evidenceId"], uid(6))
        self.assertFalse(set(body) & {"messages", "tools", "authVersion", "pilot", "scopes"})
        self.assertNotIn("private ignored", self.f.relay_calls[0].decode())
        stored = Path(self.temp.name, uid(2) + ".json")
        self.assertEqual(stored.stat().st_mode & 0o777, 0o600)
        self.assertNotIn("sealed-facts", stored.read_text())
    def test_truncated_text_never_used_as_native_receipt(self):
        self.f.bridge.mcp = lambda *_: {"content": [{"type": "text", "text": encoded(self.f.task)}]}
        result = self.f.llm()
        self.assertIn("NATIVE_RECEIPT_REQUIRED", result.choices[0].message.content)
        self.assertEqual(self.f.relay_calls, [])
    def test_model_unknown_restart_never_new_id_or_post(self):
        def unknown(wire): self.f.relay_calls.append(wire); raise OSError("synthetic network unknown")
        self.f.bridge.relay = unknown
        self.assertIn("BLOCKED", self.f.llm().choices[0].message.content)
        b = self.f.new_bridge(); self.f.capture(b); self.f.llm(b)
        self.assertEqual(len(self.f.relay_calls), 1)
        state = json.loads(Path(self.temp.name, uid(2) + ".json").read_text())
        self.assertEqual(state["responses"][0]["status"], "sending")
    def test_exact_call_id_bytes_and_receipt_only_continuation(self):
        call = self.f.call("store_task_get")
        self.f.answer = self.f.completion([call]); self.f.llm()
        bad = copy.deepcopy(call); bad["id"] = "invented"
        self.assertEqual(self.f.execute(bad)["status"], "blocked")
        self.assertEqual(len(self.f.calls), 3)
        self.assertEqual(self.f.execute(call)["status"], "receipt_recorded")
        self.f.answer = self.f.completion(); self.f.llm()
        body = json.loads(self.f.relay_calls[1])
        self.assertEqual(body["toolResults"], [{"toolCallId": "call-1"}])
        self.assertEqual(body["previousRequestId"], json.loads(self.f.relay_calls[0])["requestId"])
    def test_mutation_replay_same_bytes_not_changed_version(self):
        call = self.f.call("store_task_read_stock_evidence")
        self.f.answer = self.f.completion([call]); self.f.llm()
        self.assertEqual(self.f.execute(call)["status"], "receipt_recorded")
        count = len(self.f.calls)
        self.assertEqual(self.f.execute(call)["status"], "receipt_recorded")
        self.assertEqual(len(self.f.calls), count)
        self.f.answer = self.f.completion(); self.f.llm()
        self.assertEqual(json.loads(self.f.relay_calls[1])["expectedVersion"], 4)
        self.assertEqual(json.loads(self.f.relay_calls[1])["toolResults"][0]["receiptRequestId"], uid(20))
    def test_report_is_unverified_and_never_manager_accept(self):
        call = self.f.call("store_task_report")
        self.f.answer = self.f.completion([call]); self.f.llm(); self.f.execute(call)
        result = self.f.llm()
        self.assertIn("AWAITING_HUMAN_REVIEW", result.choices[0].message.content)
        self.assertEqual(self.f.task["state"], "awaiting_review")
        self.assertEqual(len(self.f.relay_calls), 1)
    def test_tool_schema_rejects_model_auth_and_other_run(self):
        for extras in ({"authVersion": 9}, {"runId": uid(99)}):
            with self.subTest(extras=extras):
                call = self.f.call("store_task_report", **extras)
                with self.assertRaises(Blocked): self.f.bridge._validate_call(call, {"taskId": uid(1), "runId": uid(2), "round": 1, "expectedVersion": 3, "leaseVersion": 1, "leaseToken": uid(5), "evidenceId": uid(6), "inputSnapshotHash": "a" * 64})
    def test_unknown_mcp_report_replays_original_request_only(self):
        call = self.f.call("store_task_report"); self.f.answer = self.f.completion([call]); self.f.llm()
        original = self.f.bridge.mcp
        def lost(name, args):
            result = original(name, args)
            self.f.bridge.mcp = original
            raise OSError("response lost after native commit")
        self.f.bridge.mcp = lost
        self.assertEqual(self.f.execute(call)["status"], "blocked")
        self.assertEqual(self.f.execute(call)["status"], "receipt_recorded")
        reports = [a for n, a in self.f.calls if n == "store_task_report"]
        self.assertEqual(reports[0], reports[1])
        self.assertEqual(self.f.task["taskVersion"], 4)
    def test_concurrent_same_run_only_one_model_request(self):
        second = self.f.new_bridge(); self.f.capture(second)
        threads = [threading.Thread(target=self.f.llm, args=(b,)) for b in (self.f.bridge, second)]
        for t in threads: t.start()
        for t in threads: t.join()
        self.assertEqual(len(self.f.relay_calls), 1)
    def test_runtime_base_rotation_and_deadline_fail_closed(self):
        r = self.f.bridge.llm_execution(session_id="session", base_url="https://else.invalid")
        self.assertIn("BLOCKED", r.choices[0].message.content)
        self.f.bridge.now = lambda: NOW + 86400
        self.f.llm()
        self.assertEqual(self.f.calls, [])
    def test_profile_dangerous_configuration_rejected(self):
        for p in (replace(POLICY, profile="default"), replace(POLICY, fallback_providers=("other",)), replace(POLICY, enabled_tools=TOOLS | {"terminal"}), replace(POLICY, raw_provider_credential="a-real-looking-secret")):
            with self.assertRaises(Blocked): p.validate(NOW)
    def test_journal_permissions_and_symlink_fail_closed(self):
        with tempfile.TemporaryDirectory() as d:
            os.chmod(d, 0o755)
            with self.assertRaises(Blocked): Journal(d)
        path = Path(self.temp.name, uid(2) + ".json"); path.symlink_to("/does-not-exist")
        with self.assertRaises(OSError):
            with self.f.bridge.journal.locked(uid(2)): pass
    def test_live_runtime_guard_precedes_any_network(self):
        self.f.bridge.runtime_settings = lambda: {**RUNTIME, "fallback_providers": ["unsafe"]}
        result = self.f.llm()
        self.assertIn("BLOCKED", result.choices[0].message.content)
        self.assertEqual(self.f.calls, [])

    def test_initial_claim_unknown_explicit_recovery_same_uuid_bytes(self):
        original = self.f.bridge.mcp
        def lost(name, args):
            result = original(name, args)
            if name == "store_task_claim":
                self.f.bridge.mcp = original
                raise OSError("lost after native commit")
            return result
        self.f.bridge.mcp = lost
        self.assertIn("NATIVE_OUTCOME_UNKNOWN", self.f.llm().choices[0].message.content)
        self.f.llm()
        self.assertEqual(len(self.f.relay_calls), 0)
        self.f.bridge.recover_native("session", "initial-claim")
        self.f.llm()
        claims = [a for n, a in self.f.calls if n == "store_task_claim"]
        self.assertEqual(claims[0], claims[1])
        self.assertEqual(len(self.f.relay_calls), 1)

    def test_relay_credential_connect_and_body_deadlines(self):
        for phase in ("credentials", "connect", "body"):
            with self.subTest(phase=phase):
                clock, sent = [NOW], []
                def credential():
                    if phase == "credentials": clock[0] += 2
                    return "synthetic-access-token"
                class Connection:
                    sock = None
                    def __init__(self, *a, **kw): self.timeout = kw["timeout"]
                    def connect(self):
                        if phase == "connect": clock[0] += 2
                    def request(self, *a, **kw): sent.append(True)
                    def getresponse(self): return self
                    status = 200
                    def read(self, _):
                        if phase == "body": clock[0] += 2
                        return b'{}'
                    def close(self): pass
                relay = RelayHttp("https://store.invalid", credential, deadline_at=lambda: NOW + 1, now=lambda: clock[0])
                with patch("pdca_bridge.http.client.HTTPSConnection", Connection):
                    with self.assertRaises(Blocked): relay(b'{}')
                self.assertEqual(len(sent), 1 if phase == "body" else 0)

    def test_raw_sdk_session_uses_unrendered_structured_content(self):
        loop = asyncio.new_event_loop()
        thread = threading.Thread(target=loop.run_forever); thread.start()
        class Session:
            async def call_tool(self, name, arguments):
                return types.SimpleNamespace(model_dump=lambda **kw: {"content": [{"type": "text", "text": "display"}], "structuredContent": {"task": {"synthetic": True}}})
        try:
            result = RawMcpSession(Session(), loop)("store_task_get", {"taskId": uid(1)})
            self.assertTrue(result["structuredContent"]["task"]["synthetic"])
        finally:
            loop.call_soon_threadsafe(loop.stop); thread.join(); loop.close()

    def test_native_executor_identifier_need_not_be_uuid(self):
        refs = {**REFS, "executorId": "synthetic-hermes"}
        self.f.capture(refs=refs)
        self.f.task["executorId"] = "synthetic-hermes"
        self.f.llm()
        self.assertEqual(len(self.f.relay_calls), 1)

    def test_actual_hermes_execution_middleware_seam(self):
        source = Path(os.environ.get("HERMES_SOURCE", "/Users/liangning/.hermes/hermes-agent")) / "hermes_cli/middleware.py"
        if not source.exists(): self.skipTest("local pinned Hermes source not present")
        spec = importlib.util.spec_from_file_location("hermes_middleware_source", source)
        module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
        registered = {}
        ctx = type("Context", (), {"register_tool": lambda _, **kw: True, "register_hook": lambda _, name, fn: None, "register_middleware": lambda _, name, fn: registered.setdefault(name, []).append(fn)})()
        register_bridge(ctx, self.f.bridge)
        fake_plugins = type("Plugins", (), {"get_plugin_manager": staticmethod(lambda: type("Manager", (), {"_middleware": registered})())})
        package = type("Package", (), {"plugins": fake_plugins})
        with patch.dict(sys.modules, {"hermes_cli": package, "hermes_cli.plugins": fake_plugins}):
            result = module.run_llm_execution_middleware({}, lambda _: self.f.fail_fallback(), session_id="session", base_url=POLICY.provider_base_url)
        self.assertEqual(result.id, "synthetic-relay-receipt")
        self.assertEqual(len(self.f.relay_calls), 1)

    def test_actual_tool_registry_recognition_and_official_registration_method(self):
        root = Path(os.environ.get("HERMES_SOURCE", "/Users/liangning/.hermes/hermes-agent"))
        if not root.exists(): self.skipTest("pinned local Hermes source unavailable")
        # Load only pure registry + the exact official registration method. Do not import
        # Hermes config/env-loader (which could discover the user's real default profile).
        constants = types.ModuleType("hermes_constants"); constants.hermes_home_key = lambda: "synthetic-profile"
        spec = importlib.util.spec_from_file_location("tools.registry", root / "tools/registry.py")
        registry_module = importlib.util.module_from_spec(spec)
        tools = types.ModuleType("tools"); tools.registry = registry_module
        with patch.dict(sys.modules, {"hermes_constants": constants, "tools": tools, "tools.registry": registry_module}):
            spec.loader.exec_module(registry_module)
            registry = registry_module.ToolRegistry(); registry_module.registry = registry
            tree = ast.parse((root / "hermes_cli/plugins.py").read_text())
            cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "PluginContext")
            method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "register_tool")
            method.decorator_list = []
            namespace = {"__name__": "synthetic_context", "logger": __import__("logging").getLogger("test")}
            exec(compile(ast.Module(body=[method], type_ignores=[]), "<pinned PluginContext.register_tool>", "exec", flags=__import__("__future__").annotations.compiler_flag), namespace)
            registered = {}
            manager = types.SimpleNamespace(scope_key="synthetic-profile", _plugin_tool_names=set(), _track_scoped_registration=lambda *a, **kw: True)
            ctx_class = type("ActualRegistrationContext", (), {
                "register_tool": namespace["register_tool"],
                "register_hook": lambda _, name, fn: None,
                "register_middleware": lambda _, name, fn: registered.setdefault(name, []).append(fn)})
            ctx = ctx_class(); ctx._manager = manager; ctx.manifest = types.SimpleNamespace(name="synthetic-pdca")
            register_bridge(ctx, self.f.bridge)
            self.assertEqual(set(registry.get_tool_names_for_toolset("pdca_executor_only")), TOOLS)
            for name in TOOLS:
                self.assertIsNotNone(registry.get_entry(name, scope="synthetic-profile"))
                self.assertNotIn("authVersion", registry.get_entry(name, scope="synthetic-profile").schema["parameters"]["properties"])
            call = self.f.call("store_task_get"); self.f.answer = self.f.completion([call]); self.f.llm()
            mspec = importlib.util.spec_from_file_location("hermes_middleware_registry_test", root / "hermes_cli/middleware.py")
            middleware = importlib.util.module_from_spec(mspec); sys.modules[mspec.name] = middleware; mspec.loader.exec_module(middleware)
            plugins = types.ModuleType("hermes_cli.plugins"); plugins.get_plugin_manager = lambda: types.SimpleNamespace(_middleware=registered)
            package = types.ModuleType("hermes_cli"); package.plugins = plugins
            with patch.dict(sys.modules, {"hermes_cli": package, "hermes_cli.plugins": plugins}):
                result = middleware.run_tool_execution_middleware("store_task_get", {"taskId": uid(1)}, lambda args: registry.dispatch("store_task_get", args, scope="synthetic-profile"), session_id="session", tool_call_id="call-1")
                self.assertEqual(json.loads(result)["status"], "receipt_recorded")
                # Prove real middleware fail-open reaches only an inert alias handler.
                def broken(**kwargs): raise ValueError("synthetic plugin failure")
                registered["tool_execution"] = [broken]
                result = middleware.run_tool_execution_middleware("store_task_get", {"taskId": uid(1)}, lambda args: registry.dispatch("store_task_get", args, scope="synthetic-profile"), session_id="session", tool_call_id="call-1")
                self.assertEqual(json.loads(result)["error"], "PDCA_BRIDGE_REQUIRED")

    def test_official_register_bootstraps_from_private_configured_file(self):
        path = Path(self.temp.name, "bootstrap.py")
        path.write_text("def build_bridge(ctx):\n    return ctx.synthetic_bridge\n")
        path.chmod(0o600)
        tools, middlewares = [], []
        ctx = types.SimpleNamespace(profile_name="pdca-test", synthetic_bridge=self.f.bridge,
            get_config=lambda key: str(path) if key == "bootstrap_file" else None,
            register_tool=lambda **kw: tools.append(kw["name"]) or True,
            register_hook=lambda *args: None,
            register_middleware=lambda name, fn: middlewares.append(name))
        register(ctx)
        self.assertEqual(set(tools), TOOLS)
        self.assertEqual(middlewares, ["llm_execution", "tool_execution"])
        ctx.profile_name = "default"
        ctx.get_config = lambda _: self.fail("default profile must not read bootstrap")
        with self.assertRaises(Blocked): register(ctx)


if __name__ == "__main__": unittest.main()
