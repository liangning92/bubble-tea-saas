# Bounded server order replay: two nullable receipt fields

## Deployment facts and authorization

Reviewed source baseline: ba8e436. Public latest installer: v2026.10.295 / 0eff20c.
Actual cashier executable and live API revision remain unknown. This batch changes
source and owned synthetic databases only, not production migration or deployment.
The user expressly approved two nullable Order fields: requestFingerprint and
requestReceipt. Existing NULL history is retained; neither field is a revenue,
cash, stock or points measure. No 24-hour offline cutoff is authorized or added.
Client offline checkout and destination-binding checkpoints remain separate.

## Learning before implementation

- Prisma transaction atomicity and unique constraints are the basis for once-only
  effects: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
  Live documentation now describes Prisma 8; this repository/runtime uses Prisma
  5.22.0, so keep its existing $transaction API and P2002/P2034 error contracts.
- PostgreSQL nullable additive columns preserve old rows:
  https://www.postgresql.org/docs/current/ddl-alter.html
- SQLite supports bounded ADD COLUMN; provider-specific generated clients and
  fresh isolated SQL fixtures are required: https://www.sqlite.org/lang_altertable.html
- Audit patch130's request-fingerprint/replay principle was read only. Its other
  schemas, payment evidence, ledger and inventory changes are not applied.

## Fixed design

Canonicalize validated original transport data with explicit current defaults and
hash it. The server alone creates a versioned receipt containing the original
response, store and order identity. Persist both fields inside the existing order,
stock, points and cash transaction. Existing matching receipts return before
mutable shift/payment/price/points checks; wrong content or legacy NULL identity
returns a conflict, never an invented successful receipt. Authenticate and enforce
store scope before replay. A unique-key race loser reads the committed winner's
receipt and returns it only when the fingerprint matches. Receipt persistence
failure rolls back all effects. Only the transaction creator invokes post-commit
referral processing; replay does not invoke it. Receipt fields are omitted from
normal order list/detail responses to avoid exposing internal transport metadata.

## Scope and limits

Both single and bulk order routes must use the same original schema/defaults and
replay path. New orders retain existing shift/payment admission policy. This is
not an offline-ingestion policy change or offline price revaluation feature.
createdAt remains the existing server creation time in this batch. Future offline
sales must explicitly distinguish business time from upload time in the receipt
and existing date fields; two idempotency fields alone do not repair daily cash
or shift attribution. Do not add another schema field without reporting the need.

## Verification plan

Owned PostgreSQL and SQLite plus original Express/JWT/Prisma route code: lost
reply, same/different-content concurrent requests, wrong store/token, mutable
config and consumed points after success, legacy NULL rows, rollback, single/bulk
replay and unchanged order counts/revenue/cash/stock/points. Referral invocation
uses an explicit observed test substitute; no customer messages are sent.
Migration files are review artifacts; no real database migration is executed.

## Local results before fixed review

- 110 Node regressions and 4 Python preflight rehearsals passed.
- Both real HTTP providers passed: actual two-column migration from a synthetic
  old schema with persistent backup and NULL history, lost response and exact
  single/bulk replay, policy/price/points changes, same/different concurrent input,
  store/token rejection, real sales report stability and receipt-write rollback.
- Server type check/build, Admin/POS builds, POS translation check, security review
  (18 pass/0 fail) and packaging check (17 pass/0 fail) passed.
- Electron compile has unchanged baseline `crashed` event typing errors at main.ts
  901/919/994. This is not a Windows installer validation or production readiness
  claim; the isolated server batch does not change Electron source.
- Evidence and generated-output copies are preserved in ../order-receipt-evidence.
  Production schema verification/backup/migration and deployed API revision remain
  pending fixed-commit review. No production database was accessed.
- Desktop Prisma clients generated from this schema also expect these two fields.
  The separately preserved installer helper currently upgrades only pickupNumber;
  it must not be published as compatible with this schema without resolving that
  bounded local compatibility requirement and obtaining native Windows evidence.
- createdAt is still server creation time; offline business-time reporting and
  continuous offline checkout are future batches, not delivered by this change.
