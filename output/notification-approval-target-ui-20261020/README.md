# Staff approval target fallback

Only `shared/StaffApprovalInbox.tsx` changes application behavior in this follow-up.

When the URL's `requestId` is absent from the authorized latest-100 list, the component reads the existing `/staff-permissions/approvals/:id` endpoint and merges its result without duplicates. The server retains all authorization decisions. Switching `requestId` hides the previous scope immediately, aborts the old effect, and ignores obsolete responses. Loading errors clear object rows, including 401/403/404. Existing approve/reject handlers, confirmation, permissions and pending state are retained.

Validation: staff TypeScript check and `git diff --check` passed. A focused browser fixture runs the actual staff React app on a random localhost port with fake API responses. It covers the target beyond the latest 100, native target without extra GET, same-document URL changes, blank old content while the new target loads, a delayed obsolete response, 403 and 404 clearing, and 401 session logout without retaining old object content. No approval writes occurred, pending remains pending, and browser errors were empty. Screenshots and `browser-report.json` preserve evidence; `browser-check.cjs` can rerun the fixture. The browser and server close in `finally`.

This is local fixture verification only. No production data, production browser session, real approval operation, deployment, push or PR was used. No unrelated modules were retested.
