#!/usr/bin/env python3
"""Offline artifact renderer. Default dry-run; never contacts Docker, DB or AS."""
import argparse
import json
import os
from pathlib import Path
import secrets
from urllib.parse import urlparse

SCOPES = ['management.read', 'management.assign', 'management.review',
          'executor.claim', 'executor.evidence', 'executor.report']
RESOURCE = 'https://api.aicube.online/mcp/agent-tasks'

def realm(redirect, hermes_secret):
    def mappers(client):
        return [
            {'name': 'access-client-id', 'protocol': 'openid-connect',
             'protocolMapper': 'oidc-hardcoded-claim-mapper', 'config': {
                 'claim.name': 'client_id', 'claim.value': client, 'jsonType.label': 'String',
                 'access.token.claim': 'true', 'id.token.claim': 'false', 'userinfo.token.claim': 'false'}},
            {'name': 'access-subject', 'protocol': 'openid-connect',
             'protocolMapper': 'oidc-sub-mapper', 'config': {'access.token.claim': 'true'}},
            {'name': 'mcp-resource-audience', 'protocol': 'openid-connect',
             'protocolMapper': 'oidc-audience-mapper', 'config': {
                 'included.client.audience': 'store-agent-mcp-resource',
                 'access.token.claim': 'true', 'id.token.claim': 'false'}}]
    attrs = {'access.token.header.type.rfc9068': 'true', 'access.token.signed.response.alg': 'RS256'}
    return {'realm': 'store-agents', 'enabled': True, 'sslRequired': 'all',
        'registrationAllowed': False, 'resetPasswordAllowed': False,
        'accessTokenLifespan': 120, 'defaultSignatureAlgorithm': 'RS256',
        'clientScopes': [{'name': s, 'protocol': 'openid-connect',
                          'attributes': {'include.in.token.scope': 'true'}} for s in SCOPES],
        'clients': [
            {'clientId': 'store-agent-mcp-resource', 'enabled': True, 'protocol': 'openid-connect',
             'bearerOnly': True, 'attributes': {'resource_url': RESOURCE}},
            {'clientId': 'dot-store-manager', 'enabled': True, 'protocol': 'openid-connect',
             'publicClient': True, 'standardFlowEnabled': True, 'implicitFlowEnabled': False,
             'directAccessGrantsEnabled': False, 'serviceAccountsEnabled': False,
             'redirectUris': [redirect], 'webOrigins': [], 'fullScopeAllowed': False,
             'attributes': {**attrs, 'pkce.code.challenge.method': 'S256'},
             'protocolMappers': mappers('dot-store-manager'),
             'optionalClientScopes': SCOPES[:3], 'defaultClientScopes': []},
            {'clientId': 'hermes-store-executor', 'enabled': True, 'protocol': 'openid-connect',
             'publicClient': False, 'secret': hermes_secret, 'clientAuthenticatorType': 'client-secret',
             'standardFlowEnabled': False, 'implicitFlowEnabled': False,
             'directAccessGrantsEnabled': False, 'serviceAccountsEnabled': True,
             'redirectUris': [], 'fullScopeAllowed': False, 'attributes': attrs,
             'protocolMappers': mappers('hermes-store-executor'),
             'optionalClientScopes': SCOPES[3:], 'defaultClientScopes': []}],
        'users': []}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--apply', action='store_true', help='Write new private offline artifacts ONLY; no service/DB changes')
    p.add_argument('--output', type=Path)
    p.add_argument('--dot-redirect-uri', help='Exact platform-provided HTTPS redirect; no guessed callback')
    args = p.parse_args()
    if not args.apply:
        print('DRY RUN: no files, credentials, DB, containers or network created. Apply requires a new output directory and verified platform redirect.')
        return
    if not args.output or not args.output.is_absolute() or not args.dot_redirect_uri:
        p.error('--apply requires absolute --output and --dot-redirect-uri')
    u = urlparse(args.dot_redirect_uri)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.fragment or '*' in args.dot_redirect_uri or (u.hostname.endswith(('.invalid', '.example')) or u.hostname in ('example.com', 'example.org', 'example.net', 'localhost') or '.' not in u.hostname):
        p.error('redirect must be exact verified platform HTTPS URI without wildcard/userinfo/fragment')
    # Never overwrite existing material or follow a target symlink.
    if args.output.exists() or args.output.is_symlink() or not args.output.parent.is_dir():
        p.error('output must be a new directory under an existing trusted parent')
    os.umask(0o077)
    args.output.mkdir(mode=0o700)
    pg_admin, pg_role, hermes = [secrets.token_hex(32) for _ in range(3)]
    files = {
        'postgres.env': 'POSTGRES_PASSWORD=' + pg_admin + '\nPOSTGRES_DB=postgres\nPOSTGRES_HOST_AUTH_METHOD=scram-sha-256\n',
        'keycloak.env': 'KC_DB_PASSWORD=' + pg_role + '\n',
        'hermes-client.secret': hermes + '\n',
        'store-agents-realm.json': json.dumps(realm(args.dot_redirect_uri, hermes), indent=2) + '\n',
        'initialize-identity-db.sql': (
            "\\set ON_ERROR_STOP on\nSET password_encryption = 'scram-sha-256';\n"
            "CREATE ROLE store_agent_identity LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '" + pg_role + "';\n"
            "CREATE DATABASE store_agent_identity OWNER store_agent_identity;\n"
            "REVOKE ALL ON DATABASE store_agent_identity FROM PUBLIC;\n"
            "\\connect store_agent_identity\nREVOKE CREATE ON SCHEMA public FROM PUBLIC;\n"
            "ALTER SCHEMA public OWNER TO store_agent_identity;\n")}
    for name, value in files.items():
        with (args.output / name).open('x', encoding='utf8') as f:
            os.chmod(f.name, 0o600)
            f.write(value)
    print('Private offline artifacts written; no service started and no database/realm applied. Do not print or commit rendered files.')

if __name__ == '__main__':
    main()
