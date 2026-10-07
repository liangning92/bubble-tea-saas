# Expense form save failure

Production logs confirmed POST /api/expenses returned 500 because the date-only form value (2026-10-07) was passed directly to Prisma DateTime. No expense was inserted for those failed requests.

Create, edit and import now normalize valid date-only input to Jakarta midnight; ISO timestamps remain compatible. Invalid dates and amounts return 400 before writing. The admin form parses both Indonesian dot grouping and comma grouping consistently into existing hundredths ledger units, and uses Jakarta calendar dates for today and editing saved expenses.

Validation: isolated real HTTP routes, JWT authentication and Prisma on PostgreSQL and SQLite cover create, edit, list, persisted amount/date, finance audit logs, invalid inputs without writes, and authenticated store binding. Form tests cover grouped amounts and Jakarta midnight boundaries. The real admin page is checked with synthetic network fixtures; production finance records are never created for testing.
