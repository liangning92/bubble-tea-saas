"""Explicit dedicated gateway activation. No work occurs on import or plan()."""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import threading
import time
from pdca_bridge import Blocked, ProfilePolicy, TOOLS, SCOPES

PROFILE = "stock-ro-001"
PINNED_HERMES = "a7198a8855ad98681114ff5138eb01fe132a62e7"
SENTINEL = "pdca-raw-provider-denied"


def private_file(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_nlink != 1 or info.st_size > 65536:
            raise Blocked("PRIVATE_CONFIG_REQUIRED")
        with os.fdopen(os.dup(fd)) as stream: return stream.read()
    finally: os.close(fd)


def policy_for(spec):
    return ProfilePolicy(PROFILE, spec["endpoints"]["api_origin"], spec["endpoints"]["api_origin"].rstrip("/") + "/agent-model/v1", SENTINEL, (), TOOLS, SCOPES, spec["pilot"])


def read_spec(path):
    value = json.loads(private_file(path))
    if set(value) != {"profile_home", "hermes_source", "python_executable", "gateway_bearer_file", "private_client_file", "endpoints", "pilot", "port"}:
        raise Blocked("LAUNCH_SPEC_INVALID")
    return value


def plan(spec, *, now=time.time):
    """Validate only explicit inputs, no home/config discovery, directory writes or subprocess."""
    policy = policy_for(spec); policy.validate(now())
    home = Path(spec["profile_home"])
    source = Path(spec["hermes_source"])
    if not home.is_absolute() or home.name != PROFILE or home.parent.name != "profiles" or home.is_symlink():
        raise Blocked("DEDICATED_PROFILE_PATH_REQUIRED")
    if not source.is_absolute() or not Path(spec["python_executable"]).is_absolute(): raise Blocked("ABSOLUTE_EXECUTABLE_REQUIRED")
    if type(spec["port"]) is not int or not 1024 <= spec["port"] <= 65535: raise Blocked("PORT_INVALID")
    from pdca_runtime import EndpointPolicy
    if spec["endpoints"] != vars(EndpointPolicy.production()): raise Blocked("ENDPOINT_PINS_REQUIRED")
    # Only profiles/stock-ro-001 is used; never clone/seed from default profile.
    return {"argv": [spec["python_executable"], "-m", "hermes_cli.main", "--profile", PROFILE, "gateway", "run"], "cwd": str(home), "profile_home": str(home), "deadline": policy.validate(now())}


def gateway_config(spec, home):
    policy = policy_for(spec)
    denied = {"provider": "custom", "model": "pdca-raw-denied", "base_url": policy.provider_base_url, "api_key": SENTINEL}
    return {"model": {"default": "MiniMax-M3.1-Flash", "provider": "custom", "base_url": policy.provider_base_url, "api_key": SENTINEL, "streaming": False},
        "fallback_model": [], "compression": {"enabled": False},
        "memory": {"memory_enabled": False, "user_profile_enabled": False, "nudge_interval": 0},
        "auxiliary": {name: {**denied, "enabled": False} for name in ("vision", "approval", "compression", "title_generation", "session_search", "web_extract", "curator", "background_review", "moa_reference")},
        "platform_toolsets": {"api_server": ["pdca_executor_only"], "cli": []},
        "mcp_servers": {}, "plugins": {"enabled": ["pdca-bridge"], "entries": {"pdca-bridge": {"settings": {"bootstrap_file": str(home / "pdca-bootstrap.py")}}}},
        "gateway": {"platforms": {"api_server": {"enabled": True, "extra": {"host": "127.0.0.1", "port": spec["port"]}}}}}


def live_runtime_projector(home, *, environment=None):
    """Read this explicit private profile only. No import of Hermes/default config loader."""
    env = os.environ if environment is None else environment
    if env.get("HERMES_HOME") != str(home): raise Blocked("LIVE_PROFILE_CHANGED")
    cfg = json.loads(private_file(Path(home) / "config.yaml"))
    model = cfg.get("model", {}); memory = cfg.get("memory", {}); aux = cfg.get("auxiliary", {})
    expected_aux = {"provider": "custom", "model": "pdca-raw-denied", "base_url": model.get("base_url"), "api_key": SENTINEL, "enabled": False}
    if (model.get("provider") != "custom" or model.get("default") != "MiniMax-M3.1-Flash" or model.get("streaming") is not False
            or cfg.get("platform_toolsets") != {"api_server": ["pdca_executor_only"], "cli": []}
            or cfg.get("mcp_servers") != {} or memory.get("user_profile_enabled") is not False
            or set(aux) != {"vision", "approval", "compression", "title_generation", "session_search", "web_extract", "curator", "background_review", "moa_reference"}
            or any(v != expected_aux for v in aux.values())):
        raise Blocked("UNSAFE_LIVE_PROFILE")
    return {"profile": PROFILE, "base_url": model.get("base_url"), "api_key": model.get("api_key"), "fallback_providers": cfg.get("fallback_model"), "enabled_tools": sorted(TOOLS), "executor_scopes": sorted(SCOPES),
        "auxiliary_models_enabled": False, "memory_enabled": memory.get("memory_enabled"), "compression_enabled": cfg.get("compression", {}).get("enabled")}


def _write_new(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(os.dup(fd), "w") as stream: stream.write(text); stream.flush(); os.fsync(stream.fileno())
    finally: os.close(fd)


class RunningPilot:
    def __init__(self, process, policy, *, now=time.time, stop=None):
        self.process, self.policy, self.now = process, policy, now
        self.stop = stop or (lambda: os.killpg(process.pid, signal.SIGTERM))
        self.stopped = False

    def check(self):
        if self.stopped or self.process.poll() is not None: return False
        try: self.policy.validate(self.now())
        except Exception:
            if not self.stopped: self.stop(); self.stopped = True
            return False
        return True

    def supervise(self):
        # Absolute UTC is checked again on the first CPU tick after sleep/resume.
        while self.check():
            time.sleep(0.25)

    def close(self):
        if not self.stopped and self.process.poll() is None:
            self.stop(); self.stopped = True

    def wait(self):
        self.supervise()
        return self.process.wait()


def verify_source_tree(source, *, expected_commit=None):
    """Compare worktree bytes to HEAD blobs, independent of index stat/cache flags.

    Reject every untracked/ignored file (including import shadows and in-tree venvs).
    No hook, filter, global Git config, status refresh or worktree mutation is used.
    """
    source = Path(source)
    if not source.is_absolute() or source.is_symlink() or not source.is_dir():
        raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
    expected_commit = expected_commit or PINNED_HERMES
    git_env = {"PATH": "/usr/bin:/bin", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
               "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0"}
    def git(*args):
        try:
            return subprocess.check_output(["/usr/bin/git", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=" + os.devnull,
                "-C", str(source), *args], stderr=subprocess.DEVNULL, env=git_env)
        except (OSError, subprocess.CalledProcessError):
            raise Blocked("HERMES_SOURCE_UNVERIFIABLE") from None
    if Path(os.fsdecode(git("rev-parse", "--show-toplevel").strip())).resolve() != source.resolve():
        raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
    if git("rev-parse", "HEAD").decode().strip() != expected_commit:
        raise Blocked("HERMES_SOURCE_CHANGED")
    if git("ls-files", "--others", "--exclude-standard", "-z") or git("ls-files", "--others", "--ignored", "--exclude-standard", "-z"):
        raise Blocked("HERMES_SOURCE_EXTRA_FILES")
    tree = git("ls-tree", "-r", "-z", "HEAD")
    if not tree: raise Blocked("HERMES_SOURCE_EMPTY")
    tracked = {}
    for entry in tree.split(b"\0"):
        if entry:
            metadata, filename = entry.split(b"\t", 1)
            mode, kind, blob = metadata.split(b" ")
            tracked[filename] = (mode, blob)
    indexed = {}
    for entry in git("ls-files", "--stage", "-z").split(b"\0"):
        if entry:
            metadata, filename = entry.split(b"\t", 1)
            mode, blob, stage = metadata.split(b" ")
            if stage != b"0" or filename in indexed: raise Blocked("HERMES_SOURCE_INDEX_CHANGED")
            indexed[filename] = (mode, blob)
    if indexed != tracked: raise Blocked("HERMES_SOURCE_INDEX_CHANGED")
    for entry in tree.split(b"\0"):
        if not entry: continue
        metadata, filename = entry.split(b"\t", 1)
        mode, kind, expected_hash = metadata.split(b" ")
        relative = Path(os.fsdecode(filename))
        if relative.is_absolute() or any(p in ("..", ".git") for p in relative.parts) or kind != b"blob" or mode not in (b"100644", b"100755"):
            raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
        # Git stores directory symlinks as blobs too; neither these nor substituted
        # intermediate directories may lead the importer outside the verified tree.
        cursor = source
        for component in relative.parts[:-1]:
            cursor = cursor / component
            try: info = cursor.lstat()
            except OSError: raise Blocked("HERMES_SOURCE_CHANGED") from None
            if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode): raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
        path = source / relative
        try:
            info = path.lstat()
            if not stat.S_ISREG(info.st_mode) or bool(info.st_mode & 0o111) != (mode == b"100755"):
                raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            try:
                opened = os.fstat(fd)
                if not stat.S_ISREG(opened.st_mode) or (opened.st_dev, opened.st_ino) != (info.st_dev, info.st_ino):
                    raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
                digest = hashlib.sha1(b"blob " + str(opened.st_size).encode() + b"\0")
                with os.fdopen(os.dup(fd), "rb") as stream:
                    for chunk in iter(lambda: stream.read(65536), b""): digest.update(chunk)
                after = os.fstat(fd)
                if (opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                    raise Blocked("HERMES_SOURCE_CHANGED_DURING_READ")
                if digest.hexdigest().encode() != expected_hash: raise Blocked("HERMES_SOURCE_BYTES_CHANGED")
            finally: os.close(fd)
        except OSError:
            raise Blocked("HERMES_SOURCE_CHANGED") from None
    return expected_commit


def activate(spec, *, spawn=subprocess.Popen, now=time.time, start_watchdog=True, stop=None, verify_source=None):
    """Only this explicit function creates a NEW profile and starts one foreground gateway."""
    launch = plan(spec, now=now)
    source = Path(spec["hermes_source"])
    if verify_source is None:
        verify_source_tree(source)
    else:
        # Constructor injection is for fake-process unit tests, never a CLI/config flag.
        if spawn is subprocess.Popen: raise Blocked("TEST_SEAM_REQUIRES_FAKE_PROCESS")
        if verify_source(source) != PINNED_HERMES: raise Blocked("HERMES_SOURCE_CHANGED")
    # a719 imports PROJECT_ROOT/.env even for a named profile. Refuse without reading it.
    if any((source / name).exists() for name in (".env", ".op.env")):
        raise Blocked("SOURCE_SECRET_FILES_FORBIDDEN")
    here = Path(__file__).parent
    runtime_sources = {name: (here / name).read_text() for name in ("pdca_bridge.py", "pdca_runtime.py", "pdca_launcher.py")}
    key = private_file(spec["gateway_bearer_file"]).strip()
    if len(key) < 32 or any(c.isspace() for c in key): raise Blocked("GATEWAY_BEARER_REQUIRED")
    # Validate the client config file permissions without copying its secret contents.
    fd = os.open(spec["private_client_file"], os.O_RDONLY | os.O_NOFOLLOW)
    try:
        x = os.fstat(fd)
        if x.st_uid != os.getuid() or x.st_mode & 0o077 or not stat.S_ISREG(x.st_mode): raise Blocked("PRIVATE_CLIENT_FILE_REQUIRED")
    finally: os.close(fd)
    home = Path(launch["profile_home"])
    # Refuse to overwrite or read an existing profile. The dedicated root is explicit.
    home.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    parent = home.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid() or parent.st_mode & 0o077: raise Blocked("PRIVATE_PROFILE_ROOT_REQUIRED")
    home.mkdir(mode=0o700, exist_ok=False)
    isolated_user_home = home / "isolated-user-home"
    isolated_user_home.mkdir(mode=0o700)
    plugin = home / "plugins" / "pdca-bridge"; plugin.mkdir(mode=0o700, parents=True)
    for name in ("pdca_bridge.py", "pdca_runtime.py", "pdca_launcher.py"):
        _write_new(plugin / name, runtime_sources[name])
    for source_name, target in (("plugin.yaml", plugin / "plugin.yaml"), ("__init__.py.template", plugin / "__init__.py"), ("bootstrap.py.template", home / "pdca-bootstrap.py")):
        _write_new(target, (here / "plugin" / source_name).read_text())
    config = gateway_config(spec, home)
    _write_new(home / "config.yaml", json.dumps(config))  # JSON is valid YAML.
    public = {"endpoints": spec["endpoints"], "pilot": spec["pilot"], "private_client_file": spec["private_client_file"], "profile_home": str(home)}
    _write_new(home / "pdca-launch.json", json.dumps(public))
    env = {"HOME": str(isolated_user_home), "PATH": "/usr/bin:/bin", "LANG": "en_US.UTF-8", "HERMES_HOME": str(home), "API_SERVER_HOST": "127.0.0.1", "API_SERVER_PORT": str(spec["port"]), "API_SERVER_KEY": key,
        "PYTHONPATH": str(source), "HERMES_GATEWAY_NO_SUPERVISE": "1", "HERMES_ENABLE_PROJECT_PLUGINS": "0", "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1"}
    policy = policy_for(spec); policy.validate(now())
    policy.validate_runtime(live_runtime_projector(home, environment=env))
    process = spawn(launch["argv"], cwd=launch["cwd"], env=env, start_new_session=True)
    running = RunningPilot(process, policy, now=now, stop=stop)
    if start_watchdog:
        threading.Thread(target=running.supervise, daemon=True, name="pdca-absolute-cutoff").start()
    return running


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True); parser.add_argument("--activate", action="store_true")
    args = parser.parse_args(); spec = read_spec(args.config)
    if not args.activate:
        plan(spec); print("PDCA launch plan valid; activation not requested"); return
    running = activate(spec)
    def stop_on_signal(signum, frame):
        running.close()
        raise SystemExit(128 + signum)
    signal.signal(signal.SIGTERM, stop_on_signal)
    signal.signal(signal.SIGINT, stop_on_signal)
    try: raise SystemExit(running.wait())
    finally: running.close()


if __name__ == "__main__": main()
