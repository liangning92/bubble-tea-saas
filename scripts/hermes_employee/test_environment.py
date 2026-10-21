"""Focused P2 regression: public source clone + synthetic dotenv, real Hermes.

Does not inspect or modify the installed source's dotenv/config/credentials.
"""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_runtime import PYTHON, SOURCE, HERE


class EnvironmentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="hermes-env-integrity-")
        cls.root = Path(cls.temp.name).resolve()
        cls.source = cls.root / "public-source"
        subprocess.run(["/usr/bin/git", "clone", "--shared", "--quiet", SOURCE, str(cls.source)], check=True, timeout=60,
            env={"HOME": str(cls.root), "PATH": "/usr/bin:/bin", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_LFS_SKIP_SMUDGE": "1"})
        (cls.root / "manager-outside").mkdir()
        cls.synthetic = ("SYNTHETIC_SOURCE_ENV_TOKEN=synthetic-never-load\n"
            f"HOME={cls.root / 'manager-outside'}\nHERMES_HOME={cls.root / 'manager-outside'}\n"
            "HERMES_YOLO=1\nOPENAI_BASE_URL=https://synthetic-forbidden.invalid/v1\n"
            "OPENAI_API_KEY=synthetic-not-a-real-key\nHERMES_MODEL=synthetic-manager-model\n")
        (cls.source / ".env").write_text(cls.synthetic)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def run_case(self, case):
        root = self.root / case
        root.mkdir()
        process = subprocess.run([PYTHON, "-I", "-B", str(HERE / "test_runtime.py"), "--worker", case, str(root), str(self.source)],
            capture_output=True, text=True, timeout=90, env={"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(process.returncode, 0, process.stderr[-2000:])
        result = json.loads(process.stdout.split("RUNTIME_RESULT:")[-1])
        # Only our synthetic file is read here by the parent, never real installed .env.
        self.assertEqual((self.source / ".env").read_text(), self.synthetic)
        checks = result["environmentChecks"]
        self.assertFalse(checks["sourceEnvSentinelLoaded"])
        self.assertTrue(checks["homeUnchanged"])
        self.assertTrue(checks["effectiveProfileInsideExecution"])
        self.assertFalse(checks["sourcePermissionOrRouteLoaded"])
        self.assertEqual(list((self.root / "manager-outside").iterdir()), [])
        evidence = Path.cwd() / "output/hermes-employee-runtime/p2-env"
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / (case + ".json")).write_text(json.dumps({"case": case,
            "hermesSha": "a7198a8855ad98681114ff5138eb01fe132a62e7", "environmentChecks": checks,
            "providerCalls": result["providerCalls"], "unknown": result.get("unknown", False),
            "complete": result.get("observation", {}).get("complete", False),
            "recordOutput": any(e["method"] == "recordOutput" for e in result["hostEvents"])}, indent=2))
        return result

    def test_source_dotenv_never_opened_and_real_multiturn_stays_isolated(self):
        result = self.run_case("multi_source_env")
        self.assertTrue(result["observation"]["complete"])
        self.assertEqual(result["providerCalls"], 2)
        self.assertEqual(result["environmentChecks"]["sourceEnvOpenAttempts"], 0)
        self.assertEqual(result["observation"]["profilePath"], str(Path(result["observation"]["profilePath"]).resolve()))

    def test_late_direct_dotenv_bypass_is_denied_before_read_and_stops(self):
        result = self.run_case("multi_late_dotenv")
        self.assertTrue(result["unknown"])
        self.assertEqual(result["providerCalls"], 1)
        self.assertGreaterEqual(result["environmentChecks"]["sourceEnvOpenAttempts"], 1)
        self.assertNotIn("recordOutput", [e["method"] for e in result["hostEvents"]])

    def test_home_permissions_route_mutations_are_blocked_and_unknown(self):
        result = self.run_case("multi_env_mutation")
        self.assertTrue(result["unknown"])
        self.assertEqual(set(result["environmentChecks"]["deniedMutations"]), {"HOME", "HERMES_HOME", "HERMES_YOLO", "OPENAI_BASE_URL"})
        self.assertEqual(result["providerCalls"], 1)

    def test_mapping_bypass_is_detected_and_restored_before_followup(self):
        result = self.run_case("multi_mapping_mutation")
        self.assertTrue(result["unknown"])
        self.assertEqual(result["providerCalls"], 1)
        self.assertNotIn("recordOutput", [e["method"] for e in result["hostEvents"]])


if __name__ == "__main__":
    unittest.main()
