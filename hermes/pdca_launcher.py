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
        "tools": {"tool_search": {"enabled": "off"}},
        "security": {"allow_lazy_installs": False, "tirith_enabled": False},
        "memory": {"memory_enabled": False, "user_profile_enabled": False, "nudge_interval": 0},
        "auxiliary": {name: {**denied, "enabled": False} for name in ("vision", "approval", "compression", "title_generation", "session_search", "web_extract", "curator", "background_review", "moa_reference")},
        "platform_toolsets": {"api_server": ["pdca_executor_only"], "cli": []},
        "mcp_servers": {}, "plugins": {"enabled": ["pdca-bridge"], "entries": {"pdca-bridge": {"settings": {"bootstrap_file": str(home / "pdca-bootstrap.py")}}}},
        "gateway": {"platforms": {"api_server": {"enabled": True, "extra": {"host": "127.0.0.1", "port": spec["port"]}}}}}


def live_runtime_projector(home, *, environment=None):
    """Read this explicit private profile only. No import of Hermes/default config loader."""
    env = os.environ if environment is None else environment
    if env.get("HERMES_HOME") != str(home): raise Blocked("LIVE_PROFILE_CHANGED")
    if env.get("HERMES_DISABLE_LAZY_INSTALLS") != "1" or env.get("TIRITH_ENABLED") != "0":
        raise Blocked("RUNTIME_INSTALL_GUARD_CHANGED")
    cfg = json.loads(private_file(Path(home) / "config.yaml"))
    model = cfg.get("model", {}); memory = cfg.get("memory", {}); aux = cfg.get("auxiliary", {})
    expected_aux = {"provider": "custom", "model": "pdca-raw-denied", "base_url": model.get("base_url"), "api_key": SENTINEL, "enabled": False}
    if (cfg.get("tools") != {"tool_search": {"enabled": "off"}}
            or cfg.get("security") != {"allow_lazy_installs": False, "tirith_enabled": False}
            or model.get("provider") != "custom" or model.get("default") != "MiniMax-M3.1-Flash" or model.get("streaming") is not False
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


class _VerifiedGitObjectBatch:
    """Raw cat-file protocol, without filters, replacement refs or trusted metadata.

    An object's bytes are usable only after its requested OID, object type, exact
    framing and SHA-1 are independently checked. The child is always reaped.
    """
    def __init__(self, argv, env):
        self.argv, self.env, self.process = argv, env, None

    def __enter__(self):
        try:
            self.process = subprocess.Popen([*self.argv, "cat-file", "--batch"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, env=self.env)
        except OSError:
            raise Blocked("HERMES_SOURCE_UNVERIFIABLE") from None
        return self

    def read(self, kind, oid):
        if kind not in ("commit", "tree", "blob") or len(oid) != 40 or any(c not in '0123456789abcdef' for c in oid):
            raise Blocked("HERMES_OBJECT_INVALID")
        process = self.process
        try:
            process.stdin.write(oid.encode('ascii') + b"\n")
            process.stdin.flush()
            header = process.stdout.readline(256)
            parts = header.rstrip(b"\n").split(b" ")
            if (not header.endswith(b"\n") or len(parts) != 3 or parts[0] != oid.encode('ascii')
                    or parts[1] != kind.encode('ascii') or not parts[2].isdigit() or len(parts[2]) > 20):
                raise Blocked("HERMES_OBJECT_INVALID")
            size = int(parts[2])
            body = process.stdout.read(size)
            if len(body) != size or process.stdout.read(1) != b"\n":
                raise Blocked("HERMES_OBJECT_INVALID")
        except (OSError, ValueError):
            raise Blocked("HERMES_SOURCE_UNVERIFIABLE") from None
        digest = hashlib.sha1(kind.encode() + b" " + str(size).encode() + b"\0" + body).hexdigest()
        if digest != oid:
            raise Blocked("HERMES_OBJECT_HASH_CHANGED")
        return body

    def __exit__(self, kind, value, traceback):
        process = self.process
        try:
            process.stdin.close()
            if kind is not None:
                process.kill()
            try:
                code = process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
                if kind is None:
                    raise Blocked("HERMES_SOURCE_UNVERIFIABLE") from None
            else:
                if code != 0 and kind is None:
                    raise Blocked("HERMES_SOURCE_UNVERIFIABLE")
        finally:
            process.stdout.close()


def verify_source_tree(source, *, expected_commit=None):
    """Verify the fixed raw commit/tree object chain and exact trusted checkout bytes.

    The one pinned root attribute rule expands the 13 pure-LF PowerShell blobs
    to CRLF; actual worktree bytes are never normalized. Index stat flags do not
    replace byte checks. No local attributes or replacement refs select expected code.

    Reject every untracked/ignored file (including import shadows and in-tree venvs).
    No hook, filter, global Git config, status refresh or worktree mutation is used.
    """
    source = Path(source)
    if not source.is_absolute() or source.is_symlink() or not source.is_dir():
        raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
    expected_commit = expected_commit or PINNED_HERMES
    git_env = {"PATH": "/usr/bin:/bin", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
               "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_NO_REPLACE_OBJECTS": "1"}
    git_argv = ["/usr/bin/git", "--no-replace-objects", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=" + os.devnull, "-c", "core.attributesFile=" + os.devnull, "-C", str(source)]
    def git(*args):
        try:
            return subprocess.check_output([*git_argv, *args], stderr=subprocess.DEVNULL, env=git_env)
        except (OSError, subprocess.CalledProcessError):
            raise Blocked("HERMES_SOURCE_UNVERIFIABLE") from None
    if Path(os.fsdecode(git("rev-parse", "--show-toplevel").strip())).resolve() != source.resolve():
        raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
    if git("rev-parse", "HEAD").decode().strip() != expected_commit:
        raise Blocked("HERMES_SOURCE_CHANGED")
    if git("ls-files", "--others", "--exclude-standard", "-z") or git("ls-files", "--others", "--ignored", "--exclude-standard", "-z"):
        raise Blocked("HERMES_SOURCE_EXTRA_FILES")
    # One raw-object process avoids a new Git process for every tree/blob.
    # Each response still verifies its exact requested OID, type, size and hash.
    with _VerifiedGitObjectBatch(git_argv, git_env) as objects:
        object_bytes = objects.read
        commit = object_bytes("commit", expected_commit)
        header = commit.split(b"\n", 1)[0]
        if not header.startswith(b"tree "): raise Blocked("HERMES_COMMIT_INVALID")
        root_tree = header[5:].decode('ascii')
        tracked = {}
        def visit(oid, prefix=b"", depth=0):
            if depth > 100: raise Blocked("HERMES_TREE_INVALID")
            body = object_bytes("tree", oid); offset = 0; names = set()
            while offset < len(body):
                space = body.find(b" ", offset); nul = body.find(b"\0", space + 1)
                if space < offset or nul <= space or nul + 21 > len(body): raise Blocked("HERMES_TREE_INVALID")
                mode, name = body[offset:space], body[space + 1:nul]
                child = body[nul + 1:nul + 21].hex(); offset = nul + 21
                if not name or b"/" in name or name in (b".", b"..", b".git") or name in names: raise Blocked("HERMES_TREE_INVALID")
                names.add(name); filename = prefix + name
                if mode == b"40000": visit(child, filename + b"/", depth + 1)
                elif mode in (b"100644", b"100755"): tracked[filename] = (mode, child.encode())
                else: raise Blocked("HERMES_SOURCE_BOUNDARY_INVALID")
        visit(root_tree)
        if not tracked: raise Blocked("HERMES_SOURCE_EMPTY")
        # The pinned revision has ONE verified root attributes blob, no custom filters,
        # encodings or nested rules. Only its explicit *.ps1 eol=crlf rule changes bytes.
        attributes = [name for name in tracked if name.rsplit(b"/", 1)[-1] == b".gitattributes"]
        checkout_hashes = {}
        if attributes:
            if attributes != [b".gitattributes"] or tracked[b".gitattributes"][1] != b"80824c67581d7be781d3f457280f7f1dbbd22897":
                raise Blocked("HERMES_ATTRIBUTES_UNSUPPORTED")
            object_bytes("blob", tracked[b".gitattributes"][1].decode())
            for filename, (_, blob) in tracked.items():
                if filename.endswith(b".ps1"):
                    original = object_bytes("blob", blob.decode())
                    if b"\r" in original: raise Blocked("HERMES_CHECKOUT_CONVERSION_UNSUPPORTED")
                    checkout = original.replace(b"\n", b"\r\n")
                    checkout_hashes[filename] = hashlib.sha1(b"blob " + str(len(checkout)).encode() + b"\0" + checkout).hexdigest().encode()
    indexed = {}
    for entry in git("ls-files", "--stage", "-z").split(b"\0"):
        if entry:
            metadata, filename = entry.split(b"\t", 1)
            mode, blob, stage = metadata.split(b" ")
            if stage != b"0" or filename in indexed: raise Blocked("HERMES_SOURCE_INDEX_CHANGED")
            indexed[filename] = (mode, blob)
    if indexed != tracked: raise Blocked("HERMES_SOURCE_INDEX_CHANGED")
    for filename, (mode, blob) in tracked.items():
        expected_hash = checkout_hashes.get(filename, blob)
        relative = Path(os.fsdecode(filename))
        if relative.is_absolute() or any(p in ("..", ".git") for p in relative.parts) or mode not in (b"100644", b"100755"):
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
        "PYTHONPATH": str(source), "HERMES_GATEWAY_NO_SUPERVISE": "1", "HERMES_ENABLE_PROJECT_PLUGINS": "0", "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1", "HERMES_DISABLE_LAZY_INSTALLS": "1", "TIRITH_ENABLED": "0"}
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
