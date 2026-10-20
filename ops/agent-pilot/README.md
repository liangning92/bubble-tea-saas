# Identity deployment preflight — NOT applied

This directory contains an offline template, not a deployed identity service. The backend pilot stays disabled. No database, realm, credentials, container, proxy route or persistent access was created for this delivery. The renderer's default invocation reads no environment secrets and writes nothing.

## Fixed choices and remaining inputs

- Keycloak 26.8.1 pinned to the amd64 digest exercised by the synthetic AS proof; `platform: linux/amd64` is deliberate. An arm64 host must review its native digest separately or explicitly accept emulation. Do not substitute `latest`.
- Production `start`, PostgreSQL only; `/identity` on `https://api.aicube.online`. Keycloak has 1 CPU / 1 GiB; the separate database has 0.5 CPU / 512 MiB, so these are **not total host resource limits**. Capacity and production TLS/proxy reachability remain untested.
- Required: a reviewed immutable PostgreSQL 17 image digest, a new private artifact directory outside Git, verified exact dot platform redirect URI, backup location, and a reviewed initial identity administrator / real manager enrollment procedure. No template users or generic administrator account exist. Public client means S256 PKCE with authenticated manager login, not anonymous task access.
- TLS is terminated by the existing trusted reverse proxy. Publish only the loopback 9080 listener, route `/identity/` without stripping the prefix, overwrite forwarded headers, block untrusted ingress to 9080. Never expose the DB or management port. No proxy changes are included here.
- Existing frontend/backend fixed issuer/discovery and public-key lifecycle must be coordinated before opening production routing. The host presently uses configured public RSA material: securely export/validate only the AS public key, coordinate key rotation and retirement. Never copy AS private keys into the API.

## Offline renderer

Safe current command:

```sh
python3 ops/agent-pilot/provision.py
```

**Future explicit local-artifact write only**, after the platform supplies its callback:

```sh
python3 ops/agent-pilot/provision.py --apply \
  --output /ABSOLUTE/NEW/PRIVATE/identity-config \
  --dot-redirect-uri 'https://EXACT-PLATFORM-HOST/EXACT-CALLBACK'
```

`--apply` generates cryptographically random DB administrator, DB-scoped role and Hermes client credentials, and writes a new 0700 directory / 0600 files without printing values. It does not execute Docker, SQL, Keycloak administration, network calls or create keys. Existing output is rejected; failed partial material must be reviewed, not overwritten/retried blindly. Do not use a synthetic proof account or `synthetic.invalid` identity in production.

The realm JSON contains the confidential client secret and is private. Before any container startup, an operator must ensure **only that one realm file** is readable by container UID 1000 while retaining mode 0600 (for example a reviewed `chown 1000` on that specific generated file). Do not chmod it public or recursively change unrelated files. Docker must be able to traverse/mount the private parent. Env files are read by Compose, not mounted into Keycloak. No bootstrap admin password is set.

## Future operations, each separately reviewed (NOT executed here)

Set `IDENTITY_CONFIG_DIR` to the private generated directory and `IDENTITY_POSTGRES_IMAGE` to the reviewed `postgres:17@sha256:...`; these variables contain paths/image names only. Do not run `docker compose config` into logs: resolved env files contain secrets. Use a fresh dedicated named volume, never an application DB volume.

```sh
# 1. Create ONLY dedicated identity DB; verify container/network/volume ownership first.
docker compose -f ops/agent-pilot/compose.identity.yml up -d identity-db
# 2. Apply once to that fresh DB. Password literals travel only via stdin/private SQL file.
# Ensure PostgreSQL statement/error logging will not persist password-bearing DDL.
docker compose -f ops/agent-pilot/compose.identity.yml exec -T identity-db \
  psql -U postgres -d postgres < "$IDENTITY_CONFIG_DIR/initialize-identity-db.sql"
# 3. Only after SQL success + correct private import-file UID + reviewed enrollment plan:
docker compose -f ops/agent-pilot/compose.identity.yml up -d identity
```

The `store_agent_identity` role owns only its own database/schema (Keycloak needs DDL for migrations). It is NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION and PUBLIC access is revoked. PostgreSQL's bootstrap administrator is confined to the private DB container and never supplied to Keycloak. Enforce SCRAM / reviewed pg_hba on all TCP access; do not add trust rules. Initial identity administration must use Keycloak's supported, separately reviewed temporary bootstrap/recovery mechanism with a uniquely named short-lived operator, then remove that principal; no generic admin or password grant is baked in. Manager login is unusable until legitimate manager enrollment is completed.

Startup import is for a **fresh realm only**; existing realm imports are skipped, not an update protocol. Do not delete/recreate a live realm to force an update. Read current state before retrying an interrupted import or SQL step.

## Token profile and acceptance gates

The realm reproduces the proven profile, not a custom OAuth implementation:

- `dot-store-manager`: public preregistered authorization-code client, S256 required, no implicit/direct-password/service-account grants; exactly the three optional management scopes. No wildcard redirect or CORS origin.
- `hermes-store-executor`: confidential client_credentials only, exactly executor.claim / executor.evidence / executor.report. Distinct subject/client identity; no management scope.
- Both: RS256 and access-token header `typ=at+jwt` (`access.token.header.type.rfc9068=true`), access-only `client_id` hardcoded separately per client; subject mapper. Payload `typ=Bearer` and response `token_type=Bearer` are separate from the JWT header. No login/ID-token acceptance relaxation.
- Dedicated bearer-only resource client with `resource_url=https://api.aicube.online/mcp/agent-tasks`, audience mapper, `resource-indicators` feature. The feature is experimental. Client requests must include the resource in both authorization and token requests. Static audience alone is not proof of RFC8707 request binding.

Before activation, repeat strict verifier checks against this production topology: correct JWT profile, PKCE refusal, ID-token refusal, exact audience, role separation, unknown resource token rejection, registered resource mismatch rejection, revocation, refresh/rotation and real dot preregistered-client compatibility. The prior synthetic proof did not establish actual dot connectivity, production login, secure proxy, real Hermes execution or production key rotation. AS tokens do not replace backend binding scopes, per-call fresh authorization, or the immutable pilot T0+24h cutoff. No production bindings or pilot anchor are generated here.

## Stop / rollback

Keep the previous proxy/backend configuration and an encrypted, access-controlled identity DB backup before any live change. On startup or acceptance failure, leave backend pilot disabled, remove only the newly introduced `/identity` proxy route, stop only `identity` (and the dedicated DB if no longer needed). Preserve its volume for diagnosis/restore. **Do not run `down -v`, volume prune, or remove app data.** A database restore/schema downgrade requires a separately planned backup restore; never start an older Keycloak against a migrated DB casually. Revoke newly issued client access through the established identity controls; do not assume stopping the AS invalidates existing JWTs. Keep backend bindings disabled until verified.

## Evidence and primary documentation

- Local real synthetic AS evidence: `output/keycloak-compatibility/summary.json`; 26.8.1 positive strict verifier and deferred-token resource negative checks, all owned resources cleaned. No fixture secret is reused here.
- [Keycloak production containers](https://www.keycloak.org/server/containers)
- [Keycloak database configuration](https://www.keycloak.org/server/db)
- [Keycloak MCP resource indicators and client registration](https://www.keycloak.org/securing-apps/mcp-authz-server)
- [Keycloak reverse proxy configuration](https://www.keycloak.org/server/reverseproxy)

These online pages track the current release. The template's profile was also checked in the fixed 26.8.1 synthetic proof; a documentation update alone is not a production acceptance result.
