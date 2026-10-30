"""Read private native-service transport configuration, without enrollment."""
import json
import re
from pathlib import Path

def load_config(path):
    p = Path(path)
    if not p.is_absolute() or p.resolve() != p or not p.is_file() or p.stat().st_mode & 0o077:
        raise ValueError("PRIVATE_GATEWAY_CONFIG_REQUIRED")
    value = json.loads(p.read_text())
    # An old trial's expiresAt must not stop a permanent service. Each execution
    # still has an absolute backend-issued deadline and fresh backend authority.
    for key in ["isolatedRoot", "gatewayBearerFile"]:
        if not Path(value[key]).is_absolute():
            raise ValueError("ABSOLUTE_SERVICE_PATH_REQUIRED")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", value.get("nativeImage", "")):
        raise ValueError("NATIVE_VERIFIED_IMAGE_REQUIRED")
    if not re.fullmatch(r"[a-f0-9]{40}", value.get("hermesExpectedSha", "")):
        raise ValueError("NATIVE_SOURCE_PIN_REQUIRED")
    if value.get("listenHost") != "127.0.0.1" or not 1 <= int(value.get("listenPort", 0)) <= 65535:
        raise ValueError("PRIVATE_LOOPBACK_LISTENER_REQUIRED")
    if not 1 <= int(value.get("maxConcurrency", 2)) <= 32:
        raise ValueError("NATIVE_CAPACITY_INVALID")
    if not 1 <= int(value.get("maxResidentProfiles", value.get("maxConcurrency", 2))) <= 64:
        raise ValueError("NATIVE_RESIDENT_CAPACITY_INVALID")
    secret = Path(value["gatewayBearerFile"])
    if secret.resolve() != secret or secret.stat().st_mode & 0o077:
        raise ValueError("PRIVATE_GATEWAY_BEARER_REQUIRED")
    return value
