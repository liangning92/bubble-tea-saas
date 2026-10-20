"""Owned, explicitly configured PDCA executor runtime. Importing performs no I/O.

Only a private client-credentials file and public endpoint pins are accepted. No
Hermes/default profile discovery, credential export, mutation retries or fallback.
Requires the dedicated interpreter's official mcp==1.27.0 and cryptography.
"""
from __future__ import annotations

import asyncio
import base64
import copy
import http.client
import importlib.metadata
import json
import math
import os
import stat
import ssl
import threading
import time
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote, urlencode, urlsplit

from pdca_bridge import Blocked, Bridge, ProfilePolicy, RelayHttp, SCOPES, TOOLS


@dataclass(frozen=True)
class EndpointPolicy:
    api_origin: str
    issuer: str
    resource: str

    @classmethod
    def production(cls):
        # Production bootstrap must use these code-owned pins, never a profile URL.
        origin = 'https://api.aicube.online'
        return cls(origin, origin + '/identity/realms/store-agents', origin + '/mcp/agent-tasks')

    def validate(self, policy):
        for value in (self.api_origin, self.issuer, self.resource):
            u = urlsplit(value)
            if (not u.hostname or u.username or u.password or u.query or u.fragment
                    or not (u.scheme == 'https' or u.scheme == 'http' and u.hostname in ('127.0.0.1', 'localhost', '::1'))):
                raise Blocked('INVALID_ENDPOINT_PINS')
        a, r = urlsplit(self.api_origin), urlsplit(self.resource)
        if (a.path not in ('', '/') or self.api_origin.rstrip('/') != policy.relay_origin.rstrip('/')
                or (a.scheme, a.netloc) != (r.scheme, r.netloc) or r.path != '/mcp/agent-tasks'):
            raise Blocked('INVALID_ENDPOINT_PINS')


@dataclass(frozen=True)
class PrivateClientConfig:
    endpoints: EndpointPolicy
    client_id: str
    client_secret: str = field(repr=False)
    scopes: frozenset = SCOPES


def load_private_config(path, *, endpoints: EndpointPolicy, policy: ProfilePolicy):
    endpoints.validate(policy)
    p = Path(path).absolute()
    # Reject symlinks throughout the path, including the private parent.
    for entry in (p, *p.parents):
        if entry.is_symlink(): raise Blocked('UNSAFE_CLIENT_FILE')
    parent = p.parent.stat()
    if parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700:
        raise Blocked('UNSAFE_CLIENT_DIRECTORY')
    try:
        fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            info = os.fstat(fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                    or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1):
                raise Blocked('UNSAFE_CLIENT_FILE')
            raw = os.read(fd, 16385)
            if len(raw) > 16384: raise Blocked('INVALID_CLIENT_CONFIGURATION')
            data = json.loads(raw)
        finally:
            os.close(fd)
        if (set(data) != {'api_origin', 'issuer', 'resource', 'client_id', 'client_secret', 'scopes'}
                or any(data[k] != getattr(endpoints, k) for k in ('api_origin', 'issuer', 'resource'))
                or not isinstance(data['client_id'], str) or not data['client_id']
                or not isinstance(data['client_secret'], str) or not data['client_secret']
                or any(c in data['client_id'] + data['client_secret'] for c in '\r\n')
                or not isinstance(data['scopes'], list) or len(data['scopes']) != len(SCOPES)
                or frozenset(data['scopes']) != SCOPES):
            raise Blocked('INVALID_CLIENT_CONFIGURATION')
        return PrivateClientConfig(endpoints, data['client_id'], data['client_secret'])
    except Blocked:
        raise
    except Exception:
        raise Blocked('INVALID_CLIENT_CONFIGURATION') from None


def _b64(value):
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


class ExecutorBroker:
    """Fixed issuer, RS256/JWKS, exact resource and executor scopes; no discovery."""
    def __init__(self, config, policy, *, now=time.time):
        config.endpoints.validate(policy)
        if config.scopes != SCOPES: raise Blocked('EXECUTOR_SCOPES_REQUIRED')
        self.config, self.policy, self.now = config, policy, now
        self._lock = threading.Lock()
        self._token, self._until = None, 0

    def _json(self, url, method='GET', body=None, headers=None):
        u = urlsplit(url)
        left = min(15, self.policy.validate(self.now()) - self.now())
        if left <= 0: raise Blocked('PILOT_EXPIRED')
        conn = (http.client.HTTPSConnection if u.scheme == 'https' else http.client.HTTPConnection)(u.hostname, u.port, timeout=left)
        def abort():
            sock = getattr(conn, 'sock', None)
            if sock:
                try: sock.shutdown(2)
                except OSError: pass
            conn.close()
        timer = threading.Timer(left, abort); timer.daemon = True; timer.start()
        try:
            conn.connect()
            self.policy.validate(self.now())
            conn.request(method, u.path, body=body, headers=headers or {})
            response = conn.getresponse()
            raw = response.read(262145)
            self.policy.validate(self.now())
            if response.status != 200 or len(raw) > 262144: raise Blocked('EXECUTOR_AUTH_UNAVAILABLE')
            return json.loads(raw)
        except Blocked:
            raise
        except Exception:
            raise Blocked('EXECUTOR_AUTH_UNAVAILABLE') from None
        finally:
            timer.cancel(); conn.close()

    def _verify(self, token):
        try:
            from cryptography.hazmat.primitives.asymmetric import rsa, padding
            from cryptography.hazmat.primitives import hashes
            parts = token.split('.')
            if len(parts) != 3: raise ValueError()
            header, claims = (json.loads(_b64(p)) for p in parts[:2])
            if header.get('alg') != 'RS256' or not isinstance(header.get('kid'), str): raise ValueError()
            jwks = self._json(self.config.endpoints.issuer.rstrip('/') + '/protocol/openid-connect/certs')
            matches = [k for k in jwks['keys'] if k.get('kid') == header['kid'] and k.get('kty') == 'RSA'
                       and k.get('use', 'sig') == 'sig' and k.get('alg', 'RS256') == 'RS256']
            if len(matches) != 1: raise ValueError()
            key = matches[0]
            rsa.RSAPublicNumbers(int.from_bytes(_b64(key['e']), 'big'), int.from_bytes(_b64(key['n']), 'big')).public_key().verify(
                _b64(parts[2]), (parts[0] + '.' + parts[1]).encode(), padding.PKCS1v15(), hashes.SHA256())
            now = self.now()
            if any(type(claims.get(k)) not in (int, float) or not math.isfinite(claims[k]) for k in ('exp', 'iat')): raise ValueError()
            nbf = claims.get('nbf', claims['iat'])
            if type(nbf) not in (int, float) or not math.isfinite(nbf): raise ValueError()
            if not (claims['iat'] <= now < claims['exp'] and nbf <= now): raise ValueError()
            aud = claims.get('aud')
            if aud not in (self.config.endpoints.resource, [self.config.endpoints.resource]): raise ValueError()
            if claims.get('iss') != self.config.endpoints.issuer or claims.get('azp') != self.config.client_id: raise ValueError()
            scope = claims.get('scope', '').split()
            if len(scope) != len(SCOPES) or frozenset(scope) != SCOPES: raise ValueError()
            return claims['exp']
        except Blocked:
            raise
        except Exception:
            raise Blocked('EXECUTOR_TOKEN_REJECTED') from None

    def token(self):
        with self._lock:
            end = self.policy.validate(self.now())
            if self._token and self.now() + 5 < self._until: return self._token
            basic = base64.b64encode((quote(self.config.client_id, safe='') + ':' + quote(self.config.client_secret, safe='')).encode()).decode()
            result = self._json(self.config.endpoints.issuer.rstrip('/') + '/protocol/openid-connect/token', 'POST',
                urlencode({'grant_type': 'client_credentials', 'scope': ' '.join(sorted(SCOPES)), 'resource': self.config.endpoints.resource}),
                {'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + basic})
            token, expires = result.get('access_token'), result.get('expires_in')
            if (result.get('token_type', '').lower() != 'bearer' or not isinstance(token, str) or len(token) > 65536
                    or type(expires) not in (int, float) or not math.isfinite(expires) or expires <= 0):
                raise Blocked('EXECUTOR_TOKEN_REJECTED')
            expiry = self._verify(token)
            self.policy.validate(self.now())
            self._token, self._until = token, min(end, expiry, self.now() + expires)
            if self._until <= self.now(): raise Blocked('EXECUTOR_TOKEN_REJECTED')
            return token

    def clear(self):
        with self._lock: self._token, self._until = None, 0


class RuntimeHandle:
    def __init__(self, config, *, policy, journal_directory, runtime_settings, now=time.time):
        config.endpoints.validate(policy)
        policy.validate(now()); policy.validate_runtime(runtime_settings())
        self.policy, self.now, self.config = policy, now, config
        self.broker = ExecutorBroker(config, policy, now=now)
        self._ready, self._closed = threading.Event(), threading.Event()
        self._thread = self._loop = self._stop = self._session = None
        self._failure = None
        self.bridge = Bridge(policy, journal_directory, self.raw_call,
            RelayHttp(config.endpoints.api_origin, self.broker.token, deadline_at=lambda: policy.validate(now()), now=now),
            runtime_settings=runtime_settings, now=now)

    def start(self):
        if self._thread is not None: raise Blocked('RUNTIME_ALREADY_STARTED')
        self.policy.validate(self.now())
        if importlib.metadata.version('mcp') != '1.27.0': raise Blocked('MCP_VERSION_MISMATCH')
        self._thread = threading.Thread(target=self._run, name='pdca-executor-mcp', daemon=True)
        self._thread.start()
        if not self._ready.wait(min(30, self.policy.validate(self.now()) - self.now())) or self._failure or self._closed.is_set():
            self.close(); raise Blocked('MCP_START_UNAVAILABLE')
        return self

    def _run(self):
        async def bounded():
            await asyncio.wait_for(self._main(), self.policy.validate(self.now()) - self.now())
        try: asyncio.run(bounded())
        except BaseException: self._failure = 'MCP_SESSION_UNAVAILABLE'
        finally:
            self._session = None; self._closed.set(); self._ready.set(); self.broker.clear()

    async def _main(self):
        import httpx
        from mcp import ClientSession
        from mcp.client.streamable_http import streamable_http_client
        owner = self
        class Auth(httpx.Auth):
            async def async_auth_flow(self, request):
                if str(request.url) != owner.config.endpoints.resource: raise Blocked('MCP_RESOURCE_CHANGED')
                owner.policy.validate(owner.now())
                token = await asyncio.to_thread(owner.broker.token)
                owner.policy.validate(owner.now())
                request.headers['Authorization'] = 'Bearer ' + token
                yield request  # No retry, including 401 or unknown mutation outcomes.
        self._loop = asyncio.get_running_loop()
        self._loop.set_exception_handler(lambda *_: None)
        self._stop = asyncio.Event()
        async with httpx.AsyncClient(auth=Auth(), follow_redirects=False, trust_env=False,
                timeout=httpx.Timeout(25), transport=httpx.AsyncHTTPTransport(retries=0, verify=ssl.create_default_context())) as client:
            async with streamable_http_client(self.config.endpoints.resource, http_client=client, terminate_on_close=True) as (read, write, _):
                async with ClientSession(read, write, read_timeout_seconds=timedelta(seconds=25)) as session:
                    await session.initialize()
                    self.policy.validate(self.now())
                    self._session = session; self._ready.set()
                    try: await asyncio.wait_for(self._stop.wait(), self.policy.validate(self.now()) - self.now())
                    except asyncio.TimeoutError: pass

    def raw_call(self, name, args):
        if name not in TOOLS: raise Blocked('TOOL_NOT_ALLOWED')
        end = self.policy.validate(self.now())
        if not self._session or self._closed.is_set(): raise Blocked('MCP_NOT_RUNNING')
        future = asyncio.run_coroutine_threadsafe(self._session.call_tool(name, arguments=copy.deepcopy(args)), self._loop)
        try:
            result = future.result(timeout=min(25, end - self.now()))
            self.policy.validate(self.now())
            raw = result.model_dump(by_alias=True)
            if not isinstance(raw.get('structuredContent'), dict): raise Blocked('RAW_MCP_RESULT_REQUIRED')
            return raw
        except Blocked:
            raise
        except Exception:
            future.cancel(); raise Blocked('NATIVE_OUTCOME_UNKNOWN') from None

    def close(self):
        if self._loop and self._stop and not self._closed.is_set():
            try: self._loop.call_soon_threadsafe(self._stop.set)
            except RuntimeError: pass
        if self._thread and self._thread is not threading.current_thread(): self._thread.join(timeout=30)
        self.broker.clear()
        if self._thread and self._thread.is_alive(): raise Blocked('MCP_CLOSE_INCOMPLETE')
        self._closed.set()


def build_runtime(config, *, policy, journal_directory, runtime_settings, now=time.time):
    return RuntimeHandle(config, policy=policy, journal_directory=journal_directory, runtime_settings=runtime_settings, now=now)
