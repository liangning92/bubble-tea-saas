# Notification awareness UI verification

Base: `ceb25d4aa590b716822d6bacae8b92797953fe70`.
Branch: `codex/notification-inbox-ui-20261020`.

This change adds a protected `/inbox` to admin and staff, a shared foreground awareness provider, and visible message/task entry points. Existing first-level navigation items/order, home metrics, approval actions/confirmation, training publication/content, and chat message loading/read semantics are retained. Chat list previews are plain React text. Admin `/staff/communication?channel=...` now selects the requested conversation. Staff `/approvals?requestId=...` locates an actually loaded article; other business pages can expose `data-notice-object` for the shared `?noticeObject=...` locator. Inbox result links can use `?notice=...` and show the server's current status.

The provider uses authenticated API state, polls visible pages every five seconds, resumes on focus/visibility and either `employee-inbox-updated` or `notification-awareness-changed`, prevents overlapping fetches, and aborts/clears on identity/store/session changes and unmount. No localStorage notification/read markers or push subscription are needed. Reading a notification does not clear pending business state. Inbox/list opening does not read chat or training items; concrete conversation history and training content own their reads.

## Checks

- Admin and staff TypeScript checks: passed.
- Admin and staff production builds: passed (existing bundle size warnings only).
- Admin and staff i18n checks: passed (existing hardcoded-string warnings in the repository; zero i18n errors).
- Actual React apps in isolated Playwright Chromium contexts, intercepted fixture APIs and ephemeral localhost ports: passed. `browser-check.cjs` is the reproducible harness; `browser-report.json` records the assertions.
- Responsive inbox screenshots at 390, 768, 1365 pixels for both apps, plus read-but-pending, conversation previews, and cross-store clearing.
- Verified inbox open does not mark items read; approval read remains pending; training click does not read; chat list does not read; a specific conversation loads messages before marking read; result links show current status; foreground changes arrive without push; hidden pages do not poll; focus resumes; concurrent events do not overlap requests; late previous-identity responses cannot restore old data; preview markup stays text.
- Browser and temporary servers close in `finally`. No Docker resources, production browser sessions, production data, pushes, PRs, deployments, external sends, or new keys were used.

The screenshots and browser run are fixture verification only. No live production-data or post-deployment verification was performed, per this task's no-deployment/no-real-person-operation constraint. The inbox is new, so there is no earlier inbox page to capture; retained navigation/modules were checked in source diffs and the rendered apps.
