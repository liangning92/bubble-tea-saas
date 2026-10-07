# 025 — Expense category creation feedback and summary

The category management dialog could silently ignore empty or duplicate names. Save failures depended on a browser alert, the add icon looked active when it was disabled, and the administration exposed the edit controls to managers although the existing API permits only administrators to change expense categories. Real production request logs showed category reads but no corresponding category PUT in the inspected interval; this does not establish which local browser condition caused the user's click to be ignored.

The add control now submits a form and also supports Enter. It reads the actual input value, including an autofilled value without a React change event, and gives visible inline empty-name, duplicate, success, permission and failure feedback. A synchronous pending-request lock prevents repeated submissions. Failed category reads disable modification and offer a retry instead of replacing unknown saved categories with defaults. Existing API role permissions remain unchanged.

The same UI reproduction revealed that a persisted custom-category expense appeared in the list while its summary card and total showed zero. All returned category totals are now included.

Validation uses the built administration, real routes/JWT and fresh PostgreSQL fixtures. Cases cover empty input, built-in/custom duplicates, Chinese Enter submission, autofill, repeated pending submission, failed-read retry, failed-save retained input, server 403 feedback, manager read-only controls, create/reload/select/post, and custom-category/overall summary amounts. No demonstration expense or category is written to the production store.
