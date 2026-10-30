"""Pinned upstream source verification; no Agent profile or tool configuration."""
import hashlib,os,stat,subprocess
from pathlib import Path
PINNED_HERMES="a7198a8855ad98681114ff5138eb01fe132a62e7"
class Blocked(RuntimeError):pass

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
            close_failed = False
            try:
                process.stdin.close()
            except OSError:
                close_failed = True
            if kind is not None or close_failed:
                process.kill()
            try:
                code = process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
                if kind is None:
                    raise Blocked("HERMES_SOURCE_UNVERIFIABLE") from None
            else:
                if (code != 0 or close_failed) and kind is None:
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
    # Installed sources can be root-owned while the runtime is unprivileged.
    # Trust this exact validated path for this process only; byte/object checks
    # below remain mandatory, and hooks/filters never execute.
    git_argv = ["/usr/bin/git", "--no-replace-objects", "-c", "safe.directory=" + str(source), "-c", "core.fsmonitor=false", "-c", "core.hooksPath=" + os.devnull, "-c", "core.attributesFile=" + os.devnull, "-C", str(source)]
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
