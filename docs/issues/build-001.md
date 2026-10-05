# BUILD-001: Truncated source files

Base: codex/fix-auth-security at 3a9deb8212f50a8c63792a458f020d140919876a.
Reference: master at 59eeae34feee196d8a937d29a8f02e5fa71c2cc6.

CI run 37309774624 failed at server compilation with unfinished expressions in posCash.ts, staff.ts, FinanceService.ts and InventoryService.ts. Tree comparison confirms 29 files shortened to exactly 16384 or 32768 bytes, including 21 source/document/test files and eight generated files.

Learning: TypeScript noEmit performs checks without writing compilation outputs (https://www.typescriptlang.org/tsconfig/noEmit.html). Restore lost source rather than adding artificial closing braces.

Recovery: preserve branch prefixes and append the reference tail at a unique 100-500 character overlap. FinanceReportsPage requires normalizing the reference netMargin expression to the branch nested netProfit.margin representation before finding the overlap. Generated server/dist files require regeneration from restored source; do not splice source maps.

Validation: restored prefixes checked against actual Git checkout; TypeScript syntax parsing (20 code files), all four application builds, Electron main compilation, explicit server/admin/POS/staff type checking, i18n checks, npm ci lockfile dry run, security review and packaging validation passed. Security has one pre-existing warning; packaging has three environment/configuration warnings and zero failures. Server/dist and tracked Electron output regenerated from source.

TEST DECISION: source recovery and build validation complete; runtime acceptance pending. Attempted Chromium login smoke test could not launch because browser downloads returned invalid ZIP files. Existing API integration tests require isolated PostgreSQL and test credentials; no test database is available in this workspace. No production database was accessed. Windows installer and real POS hardware/payment flows have not been validated.

Follow-up findings: root typecheck was a no-op (no workspace typecheck scripts), root lockfile out of sync, CI omitted server dependencies and Prisma generation. Correct these validation gaps and use Node 22, as the existing Windows workflow does. Restore missing finance balanceSheet API wrapper for existing server endpoint. Security review query.*\+ regex matched ordinary req.query and evaluator identifiers; narrow to executable calls. Remove explicit wildcard acceptance from credentialed CORS.

Smoke login title assertion updated from obsolete Bubble branding to the actual YOUME POS title. Changes remain on a repair branch; master deployment is not triggered.

Upload review caught a legacy hardcoded admin password restored in tests/comprehensive.spec.ts. Replaced it with TEST_ADMIN_PASSWORD before publication.
