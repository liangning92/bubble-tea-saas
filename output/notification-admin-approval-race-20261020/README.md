# Admin approval stale-response race

Application file: `client-admin/src/pages/StaffApprovalPage.tsx` only. No other shared, CI, permission, or approval business logic files were changed by this work.

The page now scopes displayed rows, errors, busy state, and store selection to the authenticated session (user/staff/role/store/token), selected store, and `noticeObject`. Scope changes hide old content during render. List/detail fetches use AbortController, request versions, and a live auth-store check; failure clears rows. Store-directory fetches also cancel and reject prior-session results. Existing action routes, refund confirmation, approval payloads, and permission rules remain; current-scope checks prevent acting from an obsolete view.

## Independent actual React reproduction

`browser-check.cjs` starts the actual admin app on a random localhost port and intercepts only synthetic fixture API responses. Its first run uses the exact saved pre-fix StaffApprovalPage source through a Vite transform, without rewriting or reverting the workspace. Hold notification A's detail response, navigate the same React page to B, load B, then release A. The original page reproduces `/approvals?noticeObject=B` showing A and A's approve button. `before-url-B-shows-approvable-A.png` and the first report object preserve the reproduction.

A separate browser context/server uses the actual fixed working-tree source. The same delayed A response cannot replace B. Further operator-level browser scenarios cover the target beyond the latest 100, native-list target without an unnecessary detail GET, immediate clearing during same-page query loading, old identity response after switching user/staff/store, selecting a different store, changing only the login session token, a late old response after a 403, 403/404 clearing, and 401 logout clearing. Pending remains pending, zero approval writes were made, and browser errors were empty.

`browser-report.json`, five screenshots, and `before-StaffApprovalPage.tsx.txt` are the evidence. Admin TypeScript and the application-file whitespace check passed. The browser and temporary servers close in `finally`; both fixture phases completed successfully. No production browser/data, real approval operation, push, commit, deployment, external send, or key creation was used. This is synthetic UI verification, not live production verification.
