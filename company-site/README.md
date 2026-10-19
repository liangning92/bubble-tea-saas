# LUMBA company website

This independent static website introduces PT LUMBA MERAH NIAGA INDONESIA and its software development, POS, and store management work. Indonesian is the default language, with an English switch. SaaS subscriptions are described as a future plan. There are no account, payment, registration, analytics, or marketing integrations.

## Isolated service

- Build context: `company-site`; Dockerfile: `company-site/Dockerfile`.
- Standalone Compose project and container: `lumba-website`.
- Origin: `http://127.0.0.1:8181`; container listens on 8080 as an unprivileged user.
- No database, credentials, persistent volumes, or connection to the existing application network.
- Access logging is disabled at the origin; Cloudflare still processes delivery and security data as described on the page.
- The origin sends `Cache-Control: public, max-age=0, must-revalidate, no-transform` so automatic Cloudflare Web Analytics does not insert a beacon into this page. The website does not change zone-wide analytics or security settings.

## Release requirements

Follow repository `AGENTS.md` and `docs/BATCH-BUILD-WORKFLOW.md`: commit only these files, verify the exact GitHub source SHA, build once, and deploy only that verified image. The existing application CI and Docker workflows recognize api/admin/pos/staff; their skipped website checks are not website validation. The dedicated manual `lumba-site.yml` workflow checks the actual container, both languages, and desktop/tablet/phone layouts, then saves its image and integrity manifest. Its optional master-only publication job loads and publishes that same verified image without rebuilding.

Use `ghcr.io/liangning92/lumba-website:sha-<full-source-sha>` with `org.opencontainers.image.revision` and a recorded image/archive digest. Do not rebuild the verified image during deployment. Keep the previous website image for rollback. This service uses its own Compose file; never run the main application's Compose stack or restart Docker for a website update.

Any local Docker testing must use `scripts/with-docker-test.py` and its test labels, temporary ports, unique names, and cleanup rules. Do not use this production Compose file as a test stack.

## Pending public network change

Before changing DNS or the running tunnel, obtain explicit confirmation of both items:

1. Proxied CNAME `lumba.aicube.online` to `7204fa56-907c-4499-ac3e-f2993ad4b1f3.cfargotunnel.com`, TTL Auto.
2. On the existing `tea-pos` tunnel, add `lumba.aicube.online` to `http://127.0.0.1:8181` before its final 404 rule. Preserve the four existing hostnames.

The existing local configuration is `/Users/liangning/.cloudflared/config.yml`, managed by launchd label `com.cloudflared.tunnel`. Local configuration changes require a connector rollout. Cloudflare recommends starting a replica with the full updated configuration before stopping the old instance; long-lived connections on the old instance can still drop. Include that effect in approval. Do not create a new tunnel or credentials.

Only after exact-SHA GitHub verification and explicit network approval should the standalone origin be deployed and the approved public route activated. Validate the public HTTPS website and both languages on desktop, tablet, and phone, then verify existing application origins and tunnel readiness again.
