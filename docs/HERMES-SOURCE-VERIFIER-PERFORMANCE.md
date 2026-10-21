# Verified Hermes source startup cost

The employee child previously started a separate `git cat-file` process for every
raw commit/tree/blob read. A clean pinned a719 checkout measured **44.64 seconds**
for the verifier alone: 1,115 Git subprocesses consumed 35.47 seconds. This is a
single local profiled observation, not model latency or a percentile.

The verifier now uses one raw `git cat-file --batch` child for object reads. Every
response still validates its exact requested object ID, expected type, size,
trailing framing and independently calculated raw Git SHA-1. No filters are run;
replacement refs and untrusted Git environment/configuration remain disabled.
The process is closed and reaped even if object/tree validation fails.

Commit/tree traversal, pinned attributes, exact trusted CRLF conversion, index
comparison, executable bits, untracked/ignored rejection, symlink boundaries and
every checkout byte hash remain checked on every execution. There is no cache
that trusts a prior HEAD or mutable checkout.

On the same clean checkout the new verifier measured **6.28 seconds** once under
the same profiler. This does not include Hermes imports, inference, tools or
message delivery. The remaining byte/path checks are intentionally retained.

Focused batch-protocol negatives and existing real-Git launcher tests cover
framing/hash substitution, normal CRLF checkout, replacement refs, index bypass,
untracked/ignored import shadows and filesystem substitutions. No production,
employee message or model call is part of this validation.
