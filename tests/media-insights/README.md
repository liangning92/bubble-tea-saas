# Media library and product insights regression

Run from the repository root:

```sh
node scripts/test-media-insights.cjs
```

The runner creates a disposable SQLite database and upload folder under `/tmp/media-product-*`, generates the SQLite client locally, checks the installer catalog against a legacy schema, runs translation and HTTP/aggregation tests, then restores the PostgreSQL generated client. It never reads or migrates an operational database. HTTP tests need permission to bind a local port.

Browser checks use mocked API responses and the real development pages:

```sh
# In separate terminals; these are development servers, not production builds.
(cd client-admin && ../node_modules/.bin/vite --host 127.0.0.1 --port 5187 --strictPort)
(cd client-pos && ../node_modules/.bin/vite --host 127.0.0.1 --port 5188 --strictPort)
node tests/media-insights/browser-check.cjs
node tests/media-insights/tv-playback-check.cjs
```

The admin check covers media previews, lazy analysis details, preferences, product gallery/spec selection, quick-add image selection/save/cancel, TV video selection, and English/Indonesian locales. The playback check holds video loading and dispatches end/error events to verify timer behavior deterministically; it does not claim to test codecs or physical displays.

Deployment requires the new `MediaAsset`, `ProductImage`, and `MediaReference` tables. PostgreSQL migration SQL is in `server/prisma/migrations/20261013_reusable_media/migration.sql`; Windows installer catalog additions are in `scripts/desktop-db-upgrade.py`. No operational database migration, formal build, deployment, or release is performed by this task.

Legacy media is adopted from explicitly referenced local product images and store screen configs when the library is first read. Ambiguous ownership, missing files, unsupported types and external URLs are not copied into the library. Absolute legacy upload URLs are adopted only for local hosts, the existing cloud API host, or an origin explicitly configured through `MEDIA_PUBLIC_ORIGIN`. External product image URLs continue to work; adding a library image replaces that legacy external main image.

Product analysis uses store-local calendar periods with an equal elapsed comparison window. Sales units reflect prepared products; unprepared refunded lines are excluded. Historical order costs and refund allocations determine margins. Missing historical cost or refund evidence marks a product incomplete and excludes it from profitable classifications. Estimated historical sales amounts are indicated in ranking tooltips. No automatic pricing or marketing changes are made.
