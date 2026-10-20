# MiniMax non-success diagnostics and optional output limits

This change is prepared for independent review only. It does not retry the original
production HTTP 529 request, edit its receipt/reservation, change credentials, or
deploy any component. The original 529 cause remains unknown because its upstream
body and trace were not retained. Later diagnostics cannot reconstruct it.

## Safe non-success metadata

The API reads at most 4096 response bytes for at most 1500 ms after receiving a
non-success HTTP status. An oversized body is discarded without parsing a prefix;
broken, HTML, non-JSON and stalled streams produce only a fixed body-status value.
The reader cancels the stream and never saves response text, error messages,
arbitrary nested fields, request data or header collections.

Only these fields may survive in the private draft or connection receipt:

| Field | Accepted value |
| --- | --- |
| `providerHttpStatus` | Existing upstream HTTP status |
| `providerDiagnostics.businessCode` | Known numeric MiniMax `base_resp.status_code` |
| `providerDiagnostics.category` | Fixed `reported_*` category from known code/type, otherwise `unknown` |
| `providerDiagnostics.bodyStatus` | `json`, `non_json`, `too_large`, `unavailable`, `empty` |
| `providerDiagnostics.traceId` | Bounded hexadecimal/UUID value from literal `trace_id` header or root JSON field |
| `providerDiagnostics.traceSource` | Fixed `response_header` or `response_body` |

Trace values matching submitted key/model/system/input text are discarded. Free
text, emails, numeric-only identifiers and nested trace values are rejected.
Reading an existing receipt reprojects these fields through the same allowlist.
An old receipt without diagnostics remains unchanged. A `reported_*` category is
the provider's structured report, not an independently proven root cause. HTTP 529
alone is never classified as overload, bad credentials, balance or subscription.

HTTP 529/5xx remain uncertain; existing explicit 401/429 rejection behavior remains.
Unknown and rejected outcomes retain their reservation. Idempotency, check revision,
original-ID replay and manual consent rules are unchanged. No automatic retry or
new-ID workaround is added.

## Optional output limit

`maxOutputTokens` defaults to `null`. Both connection checks and normal generation
omit `max_completion_tokens` and `max_tokens` when no user value is stored. The old
application constants 32 and 4096 are removed, never migrated into a user choice.
An older client omitting the settings field preserves an explicitly saved choice;
`null` clears it. A positive integer choice sends only `max_completion_tokens`.
Saving a choice increments the normal configuration version and records the choice
in the existing settings audit event. No schema migration or production data write
is required.

The optional field appears in advanced settings after a successful connection, or
when an existing explicit choice needs editing. It starts blank. Existing response
format/length, source-reference and human-publication validation still apply; these
checks do not inject a generation token limit into the provider request.

## Cost admission

Omitting a wire limit does not reserve zero cost. The current official OpenAPI makes
the output limit optional and documents a finite maximum output of 524288 for
M3/M3.1-Flash. That value is used only as a conservative budget bound. M2.5/M2.7
aliases use the same larger bound because the provider's 2026-10-19 notice routes
subscription-plan aliases to Flash; the account's actual key type is not inferred.

Admission reserves micro-USD using the configured rates:

`ceil((UTF8_input_bytes + 2048) * input_USD_per_million + output_bound * output_USD_per_million)`

An explicit user limit supplies `output_bound`; otherwise a known supplier ceiling
is required. Unknown models without a selected limit, invalid prices or malformed/
overflowing counters fail before transport, receipt creation or check-revision
advancement. A monthly budget that cannot cover the reservation also blocks before
transport. The UI labels those cases as not sent and clears only the unadmitted
local ticket. Generic gateway failures still retain the original ticket.

At the current default rates (0.3 input / 1.2 output USD per million), a short
uncapped M3 check reserves approximately USD 0.63. This is an application estimate,
not an invoice or proof of actual charges. Successful validated usage settles the
reservation; uncertain results keep it. A future real check requires a separately
approved fee boundary. This patch itself makes no real provider request.

## Verification and sources

Tests use synthetic accounts, one disposable native PostgreSQL instance per batch,
mock provider responses and a loopback browser fixture. They cover oversized and
stalled bodies, nested credentials, known/unknown codes and trace values, 529/5xx/
401/429, old receipts, replay races, uncapped output above 32/4096, explicit choice
preservation/clearing, nonzero/atomic budget reservation and fail-closed admission.
The built Admin UI is checked in Chinese/English/Indonesian on desktop and phone,
plus Chinese tablet, including control hit testing above the sticky save bar.
Evidence is retained under `output/ai-diagnostics/`. These synthetic checks do not
establish production model availability or replace later real-page acceptance.

Official sources checked 2026-10-20:

- [MiniMax OpenAI API schema](https://platform.minimax.cn/docs/api-reference/text/api/openapi-chat-openai.json): optional output parameter and documented model output ceilings.
- [MiniMax model notice](https://platform.minimax.cn/docs/faq/models): M2.5/M2.7 subscription alias routing from 2026-10-19.
- [MiniMax error codes](https://platform.minimax.cn/docs/api-reference/errorcode): numeric code meanings and literal `trace_id` header for support.
