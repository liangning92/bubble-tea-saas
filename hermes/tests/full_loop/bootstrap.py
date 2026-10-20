"""Test-only factory for owned loopback TLS pins; never installed in production."""
def build_bridge(ctx):
    import json
    import os
    from pathlib import Path
    from pdca_bridge import ProfilePolicy, TOOLS, SCOPES
    from pdca_launcher import private_file, live_runtime_projector
    from pdca_runtime import EndpointPolicy, load_private_config, build_runtime
    home=Path(os.environ['HERMES_HOME'])
    if home.name!='stock-ro-001' or ctx.profile_name!='stock-ro-001':
        raise RuntimeError('ISOLATED_PROFILE_REQUIRED')
    config=json.loads(private_file(home/'pdca-launch.json'));pins=config['endpoints']
    if not pins['api_origin'].startswith('https://localhost:'):
        raise RuntimeError('OWNED_LOOPBACK_ONLY')
    policy=ProfilePolicy('stock-ro-001',pins['api_origin'],pins['api_origin']+'/agent-model/v1',
                         'pdca-raw-provider-denied',(),TOOLS,SCOPES,config['pilot'])
    private=load_private_config(config['private_client_file'],endpoints=EndpointPolicy(**pins),policy=policy)
    handle=build_runtime(private,policy=policy,journal_directory=home/'transport-journal',
                         runtime_settings=lambda:live_runtime_projector(home))
    ctx.on_unload(handle.close);handle.start()
    return handle.bridge
