"""Hermes program + synthetic SDK/tool services, not fabricated runtime proof.

Run with the already installed Hermes venv Python -I -B. No downloaded dependencies.
Each case starts a fresh interpreter with empty HOME/environment and no socket access.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
# The pinned source is the reviewed Hermes commit the pilot and the worker run. A
# moving default checkout would test a different program than the one deployed.
SOURCE = os.environ.get("HERMES_TEST_SOURCE", "/Users/liangning/.hermes/hermes-agent")
PYTHON = os.environ.get("HERMES_TEST_PYTHON", SOURCE + "/venv/bin/python3")


def worker(case, root, source_dir=None):
    root = str(Path(root).resolve())
    source = source_dir or SOURCE
    home = Path(root) / ("home-" + case)
    home.mkdir()
    os.environ.clear()
    os.environ.update(HOME=str(home), PATH="/usr/bin:/bin", PYTHONDONTWRITEBYTECODE="1", NO_PROXY="*")
    sys.path.insert(0, str(HERE))
    from runtime_capture import run_employee, run_ticket, digest, canonical_tools, canonical_tools_digest
    import socket
    socket.socket.connect = lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("NETWORK_DISABLED"))
    sys.path.insert(0, source)
    import httpx
    calls = 0
    tool_calls = 0
    model_text = "Bisa. Siapkan gelas dan cek label bahan sebelum buka."
    expected_channel = "channel-employee-A"
    context = {"purpose": "employee_work", "compartmentKey": digest("channel-A-members-version-1"),
               "memoryNamespace": digest("channel-A-members-version-1"), "executionId": "execution-" + case,
               "isolatedRoot": root, "hermesSource": source, "providerBaseUrl": "http://127.0.0.1:49191/v1",
               "hermesExpectedSha": "a7198a8855ad98681114ff5138eb01fe132a62e7",
               "model": "employee-fixture", "providerCredential": "synthetic-not-a-real-credential",
               "input": "Tolong bantu persiapan buka toko.",
               "tools": {"employee_read_sop": {"name": "employee_read_sop", "description": "Read allowed employee SOP.",
                          "parameters": {"type": "object", "properties": {"channelId": {"type": "string"}}, "required": ["channelId"], "additionalProperties": False}}}}
    if case == "manager": context["purpose"] = "management"
    if case == "shared_memory": context["memoryNamespace"] = "manager"
    if case == "foreign_session": context["sessionId"] = "stock-session"
    if case == "foreign_process": sys.modules["run_agent"] = object()
    if case == "incomplete": context["maxTraceBytes"] = 10
    if case == "unknown_output": model_text = ""
    if case == "model_proof": model_text = '{"proof":{"decision":"allow","sources":[]},"text":"hello"}'
    if case == "multi_update":
        context["tools"]["employee_update_task"] = {"name": "employee_update_task", "description": "Update only the current authorized task.",
            "parameters": {"type": "object", "properties": {"taskId": {"type": "string"}, "state": {"type": "string"}},
                "required": ["taskId", "state"], "additionalProperties": False}}
    if case == "multi_parallel_tools":
        context["tools"]["employee_read_task"] = {"name": "employee_read_task", "description": "Read the current assigned task.",
            "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False}}
    source_env_attempts = []
    mutation_denied = []
    if source_dir:
        env_path = str(Path(source) / ".env")
        def audit_source_env(event, args):
            if event == "open" and args and isinstance(args[0], (str, bytes)) and os.fsdecode(args[0]) == env_path:
                source_env_attempts.append(True)
        sys.addaudithook(audit_source_env)

    def model_service(client, request, **kwargs):
        nonlocal calls
        assert kwargs.get("follow_redirects") is False
        calls += 1
        if case == "multi_late_dotenv":
            from dotenv import load_dotenv
            load_dotenv(Path(source) / ".env")
        if case == "multi_env_mutation":
            for key, value in {"HOME": str(Path(root).parent / "manager-outside"),
                "HERMES_HOME": str(Path(root).parent / "manager-outside"), "HERMES_YOLO": "1",
                "OPENAI_BASE_URL": "https://synthetic-forbidden.invalid/v1"}.items():
                try: os.environ[key] = value
                except PermissionError: mutation_denied.append(key)
        if case == "multi_mapping_mutation":
            os.environ._data[b"HERMES_HOME"] = str(Path(root).parent / "manager-outside").encode()
        if case == "multi_lost":
            raise httpx.ReadTimeout("synthetic response unknown", request=request)
        if calls == 1:
            channel = "channel-employee-B" if case in {"foreign_tool", "multi_foreign_tool"} else expected_channel
            if case == "multi_parallel_tools":
                # A model may request two issued tools in one round; the runtime has to
                # serialize both receipts instead of interleaving them on the pipe.
                delta = {"role": "assistant", "tool_calls": [
                    {"index": 0, "id": "call_sop", "type": "function",
                     "function": {"name": "employee_read_sop", "arguments": json.dumps({"channelId": channel})}},
                    {"index": 1, "id": "call_task", "type": "function",
                     "function": {"name": "employee_read_task", "arguments": json.dumps({})}}]}
            else:
                delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": "call_sop", "type": "function",
                         "function": {"name": "manager_finance_export" if case == "multi_unissued" else "employee_read_sop", "arguments": json.dumps({"channelId": channel})}}]}
            reason = "tool_calls"
        elif case == "multi_update" and calls == 2:
            delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": "call_update", "type": "function",
                "function": {"name": "employee_update_task", "arguments": json.dumps({"taskId": "same-employee-task", "state": "awaiting_review"})}}]}
            reason = "tool_calls"
        else:
            delta, reason = {"role": "assistant", "content": model_text}, "stop"
        chunk = {"id": "chatcmpl-synthetic", "object": "chat.completion.chunk", "created": 1,
                 "model": "employee-fixture", "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}
        end = {**chunk, "choices": [{"index": 0, "delta": {}, "finish_reason": reason}]}
        wire = "data: " + json.dumps(chunk) + "\n\ndata: " + json.dumps(end) + "\n\ndata: [DONE]\n\n"
        return httpx.Response(200, content=wire.encode(), headers={"content-type": "text/event-stream"}, request=request)

    def tool_service(name, args):
        nonlocal tool_calls
        tool_calls += 1
        if name != "employee_read_sop" or args != {"channelId": expected_channel}:
            raise PermissionError("SOURCE_ACL_DENIED")
        return {"source": {"kind": "public_sop", "id": "open-store", "version": 1},
                "text": "Siapkan gelas dan cek label bahan sebelum buka."}

    try:
        if case.startswith("multi_"):
            import uuid
            key = context["compartmentKey"]
            issued_tools = [{"type": "function", "function": s} for s in context["tools"].values()]
            # The real runtime may emit the issued tools in another order. The ticket
            # order is the backend's, so a reordered surface must still be admitted.
            if case == "multi_reordered_tools": issued_tools = list(reversed(issued_tools))
            ticket = {"protocol": "employee_work_trace_v1", "executionId": str(uuid.uuid4()), "requestId": str(uuid.uuid4()),
                "traceVersion": 1, "compartmentKey": key, "audienceHash": digest("audience"), "inputContextHash": digest("sources"),
                "toolSchemaHash": canonical_tools_digest(issued_tools),
                "sealedUserContent": context["input"], "instruction": "Coordinate only sealed employee facts; use scoped tools and answer naturally.",
                "isolation": {"protocol": "employee_work_trace_v1", "profile": "employee_work", "sessionId": "employee_work_" + digest(case),
                    "compartmentKey": key, "memoryNamespace": key, "memoryEnabled": False, "contextFilesEnabled": False,
                    "auxiliaryModelsEnabled": False, "sharedHistoryEnabled": False, "builtinToolsEnabled": False},
                "model": "MiniMax-M3.1-Flash", "tools": issued_tools}
            if case == "multi_schema_tamper": ticket["toolSchemaHash"] = digest("wrong-catalog")
            value = {"text": "Siapkan gelas dan cek label bahan sebelum buka."}
            config = {k: context[k] for k in ("isolatedRoot", "hermesSource", "hermesExpectedSha", "providerBaseUrl", "providerCredential")}
            class MultiPort:
                version = 1
                events = []
                responses = []
                unknown = []
                last_value = None
                task = {"taskId": "same-employee-task", "state": "running"}
                def advance(self, name, item):
                    assert item["executionId"] == ticket["executionId"]
                    assert item["expectedTraceVersion"] == self.version
                    self.version += 1
                    self.events.append({"method": name, "params": item})
                    return {"traceVersion": self.version}
                def recordInput(self, item):
                    actual = item["providerRequest"]
                    assert item["isolation"] == ticket["isolation"]
                    assert item["inputHash"] == digest(json.dumps(actual, ensure_ascii=False, separators=(",", ":")))
                    assert item["toolSchemaHash"] == ticket["toolSchemaHash"]
                    assert actual["messages"][1]["content"] == ticket["sealedUserContent"]
                    assert canonical_tools(actual["tools"]) == canonical_tools(ticket["tools"])
                    if item["turn"] >= 2:
                        tool_messages = [m for m in actual["messages"] if m["role"] == "tool"]
                        assert json.loads(tool_messages[-1]["content"]) == self.last_value
                        if case == "multi_parallel_tools":
                            assert len(tool_messages) == 2
                    return {**self.advance("recordInput", item), "maySend": case != "multi_denied"}
                def recordResponse(self, item):
                    self.responses.append(item)
                    return self.advance("recordResponse", item)
                def executeTool(self, item):
                    assert item["callOrdinal"] in (0, 1)
                    self.advance("executeTool", item)
                    if item["name"] == "employee_update_task":
                        assert case == "multi_update" and item["toolCallId"] == "call_update"
                        assert item["args"] == {"taskId": "same-employee-task", "state": "awaiting_review"}
                        self.task.update(item["args"])
                        self.last_value = dict(self.task)
                        return {"traceVersion": self.version, "value": self.last_value, "sources": []}
                    if item["name"] == "employee_read_task":
                        assert case == "multi_parallel_tools" and item["callOrdinal"] == 1
                        self.last_value = {"taskId": "same-employee-task", "state": "running"}
                        return {"traceVersion": self.version, "value": self.last_value, "sources": []}
                    assert item["toolCallId"] == "call_sop"
                    if item["args"] != {"channelId": expected_channel}:
                        raise PermissionError("real synthetic tool source ACL rejected other channel")
                    self.last_value = value
                    return {"traceVersion": self.version, "value": value,
                        "sources": [{"source": {"kind": "public_sop", "id": "open-store", "version": 1}, "fingerprint": digest("sop"), "value": value}]}
                def recordOutput(self, item):
                    assert item["providerMessage"] == self.responses[-1]["providerMessage"]
                    return {**self.advance("recordOutput", item), "requestId": ticket["requestId"], "text": item["providerMessage"]["content"]}
                def markUnknown(self, execution, version, code):
                    self.unknown.append({"executionId": execution, "version": version, "code": code})
            port = MultiPort()
            if case == "multi_stdio":
                import io, contextlib
                from host_stdio import main
                incoming = io.StringIO("\n".join(json.dumps(x) for x in [{"ticket": ticket, "config": config},
                    {"result": {"traceVersion": 2, "maySend": True}}, {"result": {"traceVersion": 3}},
                    {"result": {"traceVersion": 4, "value": value, "sources": []}},
                    {"result": {"traceVersion": 5, "maySend": True}}, {"result": {"traceVersion": 6}},
                    {"result": {"traceVersion": 7, "requestId": ticket["requestId"], "text": model_text}}]) + "\n")
                outgoing, original_stdin = io.StringIO(), sys.stdin
                try:
                    sys.stdin = incoming
                    with contextlib.redirect_stdout(outgoing): main(provider_send=model_service)
                finally: sys.stdin = original_stdin
                return {"frames": [json.loads(line) for line in outgoing.getvalue().splitlines()], "providerCalls": calls}
            result = run_ticket(ticket, config, port, provider_send=model_service)
            result.update(providerCalls=calls, hostEvents=port.events, unknownMarks=port.unknown, task=port.task)
            if source_dir:
                result["environmentChecks"] = {"sourceEnvOpenAttempts": len(source_env_attempts),
                    "sourceEnvSentinelLoaded": "SYNTHETIC_SOURCE_ENV_TOKEN" in os.environ,
                    "homeUnchanged": os.environ.get("HOME") == str(home),
                    "effectiveProfileInsideExecution": Path(os.environ.get("HERMES_HOME", "/")).is_relative_to(Path(root) / "executions"),
                    "sourcePermissionOrRouteLoaded": any(k in os.environ for k in ["HERMES_YOLO", "OPENAI_BASE_URL", "OPENAI_API_KEY", "HERMES_MODEL"]),
                    "deniedMutations": mutation_denied}
            return result
        result = run_employee(context, provider_send=model_service, tool_execute=tool_service)
        result.update(providerCalls=calls, backendToolCalls=tool_calls)
        if case == "restart":
            # Reusing an execution/profile after restart must fail before provider/model access.
            second_home = Path(root) / "restart-home"
            second_home.mkdir()
            try:
                run_employee(context, provider_send=model_service, tool_execute=tool_service)
                result["restartRejected"] = False
            except (ValueError, FileExistsError):
                result["restartRejected"] = True
        return result
    except (ValueError, FileExistsError) as error:
        return {"rejected": str(error), "providerCalls": calls, "backendToolCalls": tool_calls}


class RuntimeTest(unittest.TestCase):
    def run_case(self, case):
        with tempfile.TemporaryDirectory(prefix="hermes-employee-test-") as root:
            # Seed unrelated manager and inventory roots. They must never enter actual wire input.
            (Path(root) / "manager").mkdir()
            (Path(root) / "manager" / "MEMORY.md").write_text("SYNTHETIC_MANAGER_SECRET_PROFIT_777")
            (Path(root) / "stock-session.json").write_text("SYNTHETIC_INVENTORY_CONTEXT_888")
            result = subprocess.run([PYTHON, "-I", "-B", str(__file__), "--worker", case, root, SOURCE],
                                    capture_output=True, text=True, timeout=90,
                                    env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"})
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            return json.loads(result.stdout.split("RUNTIME_RESULT:")[-1])

    def test_real_hermes_tool_roundtrip_and_complete_wire(self):
        r = self.run_case("normal")
        self.assertTrue(r["complete"], r)
        self.assertEqual(r["providerCalls"], 2)
        self.assertEqual(r["backendToolCalls"], 1)
        self.assertEqual(len(r["toolEvents"]), 1)
        self.assertEqual(len(r["modelResponses"]), 2)
        self.assertIn("call_sop", r["modelResponses"][0]["body"])
        self.assertTrue(r["toolEvents"][0]["complete"])
        wire = json.dumps(r["modelRequests"])
        self.assertIn("employee_read_sop", wire)
        self.assertIn("Siapkan gelas", wire)
        self.assertNotIn("SYNTHETIC_MANAGER_SECRET", wire)
        self.assertNotIn("SYNTHETIC_INVENTORY_CONTEXT", wire)
        self.assertIn("Active Hermes profile: employee_work", wire)
        self.assertEqual(r["output"], "Bisa. Siapkan gelas dan cek label bahan sebelum buka.")
        self.assertNotIn("decision", r)

    def test_manager_shared_memory_and_foreign_session_rejected(self):
        for case in ("manager", "shared_memory", "foreign_session", "foreign_process"):
            with self.subTest(case=case):
                r = self.run_case(case)
                self.assertIn("rejected", r)
                self.assertEqual(r["providerCalls"], 0)

    def test_foreign_tool_acl_failure_cannot_yield_complete_trace(self):
        r = self.run_case("foreign_tool")
        self.assertFalse(r["complete"])
        self.assertFalse(r["toolEvents"][0]["complete"])

    def test_restart_cannot_reuse_execution_profile(self):
        r = self.run_case("restart")
        self.assertTrue(r["complete"])
        self.assertTrue(r["restartRejected"])
        self.assertEqual(r["providerCalls"], 2)

    def test_incomplete_capture_and_unknown_output_fail_closed(self):
        for case in ("incomplete", "unknown_output"):
            with self.subTest(case=case):
                r = self.run_case(case)
                self.assertFalse(r["complete"])

    def test_model_self_declared_proof_is_only_untrusted_output_text(self):
        r = self.run_case("model_proof")
        self.assertTrue(r["complete"])
        self.assertIn('"proof"', r["output"])
        self.assertNotIn("proof", r)
        self.assertNotIn("decision", r)

    def test_stdio_launcher_transports_existing_host_port_without_model_proof(self):
        r = self.run_case("multi_stdio")
        self.assertEqual([f["method"] for f in r["frames"]], ["recordInput", "recordResponse", "executeTool", "recordInput", "recordResponse", "recordOutput", "finished"])
        self.assertEqual(r["providerCalls"], 2)
        actual = json.loads(r["frames"][-1]["params"]["observation"]["modelRequests"][0]["body"])
        self.assertEqual(r["frames"][0]["params"]["providerRequest"], actual)
        self.assertEqual(r["frames"][2]["params"]["toolCallId"], "call_sop")

    def test_multiturn_host_records_real_response_before_scoped_tool_and_next_input(self):
        r = self.run_case("multi_normal")
        self.assertTrue(r["observation"]["complete"])
        self.assertEqual(r["observation"]["mode"], "hermes_conversation")
        self.assertEqual([e["method"] for e in r["hostEvents"]], ["recordInput", "recordResponse", "executeTool", "recordInput", "recordResponse", "recordOutput"])
        self.assertEqual(r["providerCalls"], 2)
        self.assertEqual(r["unknownMarks"], [])
        self.assertEqual(r["observation"]["toolEvents"][0]["sources"][0]["source"]["kind"], "public_sop")

    def test_multiturn_denied_unknown_or_cross_channel_cannot_continue_or_publish(self):
        for case in ("multi_denied", "multi_lost", "multi_foreign_tool", "multi_schema_tamper"):
            with self.subTest(case=case):
                r = self.run_case(case)
                self.assertTrue(r["unknown"])
                self.assertEqual(r["providerCalls"], 0 if case in {"multi_denied", "multi_schema_tamper"} else 1)
                self.assertNotIn("recordOutput", [e["method"] for e in r["hostEvents"]])
                self.assertEqual(len(r["unknownMarks"]), 1)

    def test_real_hermes_reads_then_updates_same_task_through_two_scoped_tool_rounds(self):
        r = self.run_case("multi_update")
        self.assertTrue(r["observation"]["complete"])
        self.assertEqual(r["providerCalls"], 3)
        self.assertEqual(r["task"], {"taskId": "same-employee-task", "state": "awaiting_review"})
        self.assertEqual([e["params"]["name"] for e in r["hostEvents"] if e["method"] == "executeTool"], ["employee_read_sop", "employee_update_task"])
        self.assertEqual(len(r["observation"]["toolEvents"]), 2)

    def test_actual_catalog_hash_tamper_fails_before_host_admission(self):
        r = self.run_case("multi_schema_tamper")
        self.assertTrue(r["unknown"])
        self.assertEqual(r["providerCalls"], 0)
        self.assertEqual(r["hostEvents"], [])

    def test_reordered_issued_tools_are_the_same_surface_and_still_execute(self):
        # The real 2026-10-21 failure: the runtime emitted exactly the issued tools in
        # another order and dropped an empty required list. The surface was unchanged,
        # but the order sensitive comparison rejected every provider turn.
        r = self.run_case("multi_reordered_tools")
        self.assertNotIn("unknown", r)
        self.assertGreaterEqual(r["providerCalls"], 1)
        self.assertTrue(any(e["method"] == "recordInput" for e in r["hostEvents"]))

    def test_parallel_issued_tool_calls_are_serialized_into_ordered_receipts(self):
        # The real model asked for two issued tools in one round. Without serialized
        # frames the child raced itself on the trusted pipe and died before any tool
        # receipt reached the backend.
        r = self.run_case("multi_parallel_tools")
        self.assertNotIn("unknown", r)
        calls = [e["params"]["name"] for e in r["hostEvents"] if e["method"] == "executeTool"]
        self.assertEqual(sorted(calls), ["employee_read_sop", "employee_read_task"])
        ordinals = [e["params"]["callOrdinal"] for e in r["hostEvents"] if e["method"] == "executeTool"]
        self.assertEqual(sorted(ordinals), [0, 1])
        self.assertGreaterEqual(r["providerCalls"], 2)

    def test_tool_surface_comparison_is_order_insensitive_but_still_exact(self):
        from runtime_capture import canonical_tools, canonical_tools_digest
        issued = [
            {"type": "function", "function": {"name": "employee_read_message", "description": "Read one current audience-visible message",
             "parameters": {"type": "object", "properties": {"seq": {"type": "integer", "minimum": 1}}, "required": ["seq"], "additionalProperties": False}}},
            {"type": "function", "function": {"name": "employee_read_task", "description": "Read this assigned employee task",
             "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False}}},
        ]
        # Same surface, other order, other key order, empty required dropped.
        emitted = [
            {"function": {"description": "Read this assigned employee task", "name": "employee_read_task",
              "parameters": {"properties": {}, "additionalProperties": False, "type": "object"}}, "type": "function"},
            {"function": {"parameters": {"additionalProperties": False, "type": "object", "properties": {"seq": {"minimum": 1, "type": "integer"}}, "required": ["seq"]}, "name": "employee_read_message", "description": "Read one current audience-visible message"}, "type": "function"},
        ]
        self.assertEqual(canonical_tools(emitted), canonical_tools(issued))
        self.assertEqual(canonical_tools_digest(emitted), canonical_tools_digest(issued))
        # A different surface is still a different surface.
        changed = json.loads(json.dumps(emitted))
        changed[1]["function"]["parameters"]["properties"]["seq"]["minimum"] = 2
        self.assertNotEqual(canonical_tools(changed), canonical_tools(issued))
        extra = json.loads(json.dumps(emitted)) + [emitted[0]]
        self.assertNotEqual(canonical_tools(extra), canonical_tools(issued))
        renamed = json.loads(json.dumps(emitted))
        renamed[0]["function"]["name"] = "employee_other"
        self.assertNotEqual(canonical_tools(renamed), canonical_tools(issued))
        dropped = json.loads(json.dumps(emitted))[:1]
        self.assertNotEqual(canonical_tools(dropped), canonical_tools(issued))

    def test_unissued_model_tool_cannot_reach_hermes_dispatch_or_backend_tool(self):
        r = self.run_case("multi_unissued")
        self.assertTrue(r["unknown"])
        self.assertEqual(r["providerCalls"], 1)
        self.assertEqual([e["method"] for e in r["hostEvents"]], ["recordInput"])


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--worker":
        print("RUNTIME_RESULT:" + json.dumps(worker(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None), ensure_ascii=False))
    else:
        unittest.main()
