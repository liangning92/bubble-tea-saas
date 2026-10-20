# Training publication update notices

This change implements content publication notices. It does not edit the real training catalogue, recipes, lessons, or seed content, and does not publish or deploy any component.

## Persistence and boundaries

`TrainingLibraryStore.writeTrainingLibrary(..., 'publish', ...)` compares the new published catalogue with the previously published catalogue (the readable defaults before a first publication). It writes personal reminders using `EmployeeWorkspaceStore.writeWork(..., tx)` inside the same publication transaction, after the existing generation compare-and-set. A failed reminder write rolls back the published head, content revision, history and reminders together. Draft save and restore do not notify.

Each added or changed module/checklist gets a canonical SHA-256 digest of its kind, stable module/checklist key, and content. Object property order, `reviewed`, internal section/question `key` values, the publication author/note and revision IDs do not cause an alert. Changes to title, translation, summary, minutes, lesson text, ordering, attachments, practice/quiz answers and explanations, sources, and checklist items do. Removing an item does not notify; old notices become irrelevant while that item is absent or has different content. Whole-catalogue assessment metadata is not rendered by the employee course/checklist screen and is outside these module/checklist alerts.

The event is `training-content:<fingerprint>`; its personal ID is SHA-256 of `userId:staffId:event`, using the existing employee reminder namespace. Re-publishing identical content, including after deletion or restoring an older version, preserves an existing recipient's previous receipt and does not create a repeated alert. A newly eligible employee can get their first receipt when a subsequent publication actually reintroduces/changes that content. Publication is not a retroactive broadcast to employees hired after it.

Recipients are current active staff in the publication's actual store, with a linked supported user account and employee-app `personal.training` access. The employee app deliberately grants personal training independent of configurable management role permissions; revoking a management template permission alone does not remove personal training. Recipient `userId` is persisted to prevent an old staff account binding from transferring personal notifications.

## Inbox integration contract

`trainingUpdateRelevant(db, storeId, reminder, staffId)` is read-only. The inbox and push delivery must call it before exposing a training update. It rechecks store membership, current active staff, linked user binding, personal training access, and the actual current published item's fingerprint. An unchanged item remains relevant when another item is published later; a different/removed item does not. It never reads drafts for recipients.

A reminder has a generic title, personal `staffId` and `userId`, `read: false`, `status: 'pending'`, and:

```ts
trainingUpdate: {
  kind: 'module' | 'checklist',
  moduleKey: string, // key for the module or checklist
  itemKey?: string, // additionally the checklist key
  fingerprint: string,
  revision: string,
  generation: string
}
```

Employee URLs are `/training?tab=courses&module=<key>&notice=<id>` and `/training?tab=checklists&item=<key>&notice=<id>`. `TrainingPage` consumes those query parameters to open the actual current module or locate the checklist. Unknown/withdrawn targets show a generic notice without opening or acknowledging an absent item.

The employee page reads `GET /staff-work/my/inbox` with `{items:[...]}` and acknowledges only visible opened module events or explicitly viewed checklist events using `POST /staff-work/my/inbox/:id/read`. Read errors retain unread state and expose retry controls inside an open module. Successful reads emit `employee-inbox-updated` so the global entry can refresh. These actions never write `/my/learning` or `/my/checklist`, and never mark a business task complete.

## Automatic refresh

The shared catalogue hook refreshes every 30 seconds while visible, and on focus, visibility recovery and reconnect. Each request has a 12 second timeout, allows only one in-flight request, aborts on identity/unmount changes, and preserves the same state object for an unchanged revision. Background errors hide stale content and show the existing retry state. The training notices hook also refreshes the unified inbox every 30 seconds while visible and on focus/reconnect; account/store-scoped state prevents previous users' badges from rendering.

## Verification

- Server and employee TypeScript checks: `server/node_modules/.bin/tsc --noEmit -p server/tsconfig.json` and `node_modules/.bin/tsc --noEmit -p client-staff/tsconfig.json`.
- Disposable real PostgreSQL service integration: `python3 scripts/with-docker-test.py -- python3 scripts/test-training-update-notices.py`. The runner requires wrapper batch ownership, uses a random local port, synthetic records and its own database, and stops/removes its temporary PostgreSQL instance in `finally`. Covers draft isolation, identical initial publication, exact recipient selection, deterministic replay, conflicting retries, internal metadata changes, stale content withdrawal, checklist URLs, deletion/reintroduction receipts, deactivation/store move/user rebinding, forced notification-write rollback and concurrent publishers.
- Synthetic browser verification of the real `TrainingPage`: `node tests/stoploss/training-update-notices-page-check.cjs`. All API requests are intercepted; the one Vite server uses a temporary port and closes in `finally`. Covers item-only reads, exact module/checklist navigation, failed read retry, cross-device focus sync, automatic catalogue refresh, stale-content errors, removed targets, identity switching, and desktop/tablet/mobile layouts. Screenshots are in `output/training-update-notices`.
- Real production/user-data UI verification is intentionally not performed under this task's no-production restriction. Screenshots are synthetic validation, not production evidence.
