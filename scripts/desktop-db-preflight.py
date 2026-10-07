"""Advisory only: inspect existing SQLite read-only; never authorizes installation."""
import argparse
import hashlib
import json
import pathlib
import sqlite3
import sys
import urllib.parse


def inspect_database(filename):
    db = pathlib.Path(filename).resolve()
    result = {"database": str(db), "readOnly": True, "installationAllowed": False}
    if not db.is_file():
        return dict(result, status="blocked", reason="DATABASE_MISSING_OR_UNREADABLE")
    sidecars = [pathlib.Path(str(db) + suffix) for suffix in ("-wal", "-shm", "-journal")]
    if any(file.exists() for file in sidecars):
        return dict(result, status="blocked", reason="ACTIVE_OR_UNCHECKPOINTED_DATABASE")
    before = hashlib.sha256(db.read_bytes()).hexdigest()
    connection = sqlite3.connect("file:" + urllib.parse.quote(db.as_posix(), safe="/:") + "?mode=ro&immutable=1", uri=True)
    try:
        connection.execute("PRAGMA query_only=ON")
        integrity = connection.execute("PRAGMA integrity_check").fetchall()
        if integrity != [("ok",)]:
            return dict(result, status="blocked", reason="INTEGRITY_CHECK_FAILED")
        fields = connection.execute('PRAGMA table_info("Order")').fetchall()
        field = next((row for row in fields if row[1] == "pickupNumber"), None)
        ready = field is not None and field[2].upper() == "TEXT" and field[3] == 0
        reason = "PICKUP_COLUMN_READY_ADVISORY_ONLY" if ready else "ORDER_PICKUP_COLUMN_MISSING_OR_INCOMPATIBLE"
    finally:
        connection.close()
    after = hashlib.sha256(db.read_bytes()).hexdigest()
    if before != after or any(file.exists() for file in sidecars):
        return dict(result, status="blocked", reason="DATABASE_CHANGED_DURING_INSPECTION")
    return dict(result, status="column-ready" if ready else "blocked", reason=reason, databaseUnchanged=True,
                requiredChanges=[] if ready else ["Order.pickupNumber nullable TEXT", "Order_pickupNumber_idx index"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    try:
        report = inspect_database(args.database)
    except (OSError, sqlite3.Error) as error:
        report = {"status": "blocked", "readOnly": True, "installationAllowed": False, "reason": type(error).__name__}
    print(json.dumps(report, ensure_ascii=False))
    sys.exit(0 if report["status"] == "column-ready" else 73)
