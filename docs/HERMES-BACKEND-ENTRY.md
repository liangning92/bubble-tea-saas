# Hermes native backend entry

New employee-runtime tickets expose one business tool, `employee_backend`, rather
than separate inventory, marketing, finance, staffing and membership adapters.
Conversation delivery and scoped memory remain separate runtime facilities.
Historical tickets retain their originally issued tool contracts; their handlers
are compatibility code, not tools advertised to new executions.

Native team messages retain the actual authorizing account in the audit trail,
carry a private server-issued Hermes marker, and do not trigger human takeover or
another AI reply. A JSON body or bearer claim cannot supply this marker.

The entry discovers the concrete Express routes registered by
`declareAccessRoutes`. `catalog` returns bounded summaries; `describe` returns
schemas attached to the native validators. Inline controller validation without
published metadata is explicitly labelled incomplete. An absent schema is not a
claim that any invented request body is valid.

`execute` uses the same router mount order, current-account authentication,
permissions, controller and business services as HTTP. Identity is supplied by a
private in-process symbol, never a model-provided role, bearer or URL. It is
reloaded by native authentication. Store selectors and referenced resources are
bound to the requesting store, including for administrators. Responses and cached
receipts are rechecked against the conversation audience. Private channel results
cannot be released merely because the requesting administrator can read them.

The contract version includes the deployed source SHA, native route declarations,
request schemas and operation effects. Stale versions fail before dispatch and
require discovery again. This detects upgrades; it does not promise that all future
business schema changes are automatically backward compatible.

Each execution/tool-call pair reserves a durable operation receipt before native
dispatch. The native request runs outside the runtime trace transaction, retaining
its own transactions, response lifecycle and notification effects. The result is
saved before the final trace CAS. A running, reserved or unknown operation is never
automatically replayed. A caller timeout does not imply native cancellation.
Identical mutations from the same source message also reuse the durable receipt
across execution/call IDs. Preview and quote operations remain repeatable.

Credential/system changes are excluded; payments and employee penalties still
require owner approval. This bridge cannot publish paused/draft marketing without
an auditable publication decision. Legacy status mappings are checked according to
their actual native semantics rather than a shared fictional `draft` enum.

The native `POST /api/marketing/activities/:id/poster-preview` operation reuses the
formal admin/TV renderer and pins the saved activity version. Its present coverage
is a single-product special-price poster. Rendered pixels enter model vision via a
trusted execution-local sidecar, avoiding SDK text truncation without weakening
history validation. Product images alone are not rendered posters or acceptance.

## Current limits

This change is a unified JSON API entrance, **not complete browser access to every
admin page**. It does not yet provide generic page navigation, form manipulation,
or multipart upload using authorized attachment references. Native routes lacking
described input contracts still need contract coverage. A multi-day/SKU campaign
model is separate work. Do not describe those capabilities as shipped or use
isolated fixtures as evidence of production store operations.

## Verification and release

Build the server, then run disposable database checks through the owned-resource
wrapper:

```sh
npm run build:server
python3 scripts/with-docker-test.py -- python3 scripts/test-management-backend.py
python3 scripts/with-docker-test.py -- python3 scripts/test-employee-runtime.py
```

The SDK regression must use `HERMES_TEST_SOURCE` and `HERMES_TEST_PYTHON` pointing to
the same pinned source and Python installation as the running gateway. It uses
synthetic provider responses with network disabled, including four large poster
receipts, changed receipt references and parallel calls. It consumes no model quota.

Release exact verified API/worker images plus the matching gateway adapter. Keep
business promotions paused. After release, obtain actual Hermes read/discovery
receipts in the existing authenticated conversation; engineering must not perform
store configuration as a substitute for Hermes.
