# Activity poster editor and playback — 2026-10-26

The running API and admin had direct, unversioned changes beyond the repository. A separate recovery commit preserves those already deployed sources before this change. Original image IDs, source hashes and UI screenshots are retained in the local output/marketing-poster-20261026 evidence directory. No unrelated working copies are modified.

## Retained functionality

- Activity type, eligibility, channels, payment restrictions, schedule, publication states and existing marketing navigation.
- Card addition, deletion, ordering, weekday labels, product binding, name/price overrides and individual colours.
- Single/two row layouts, seven day presets, image fit/bleed, positions, typography, themes, borders, shadows and today highlighting.
- Existing menu, media, music, lottery execution and pairing flow outside configured posters.

## Improvements

- API round-trips all editor design settings, card IDs and per-card styling rather than silently discarding them.
- One renderer produces admin previews, web customer displays and the offline TV shell. HTML is escaped and image/CSS values are constrained.
- Per-activity content supports products, lottery prizes, tier thresholds and free text cards. Templates are editable starting layouts.
- Added undo/redo, duplicate card, library image picker, subtitle, weekday binding, canvas ratios and preview pagination.
- Real selected-spec prices replace invented prices. Conditional basket offers retain their actual rules instead of an invented per-item price.
- Saved card order and row settings render consistently. Poster changes invalidate the playback cache. Today uses the activity time zone without a weekend-to-Monday fallback.
- Playback respects activity schedule, channel, usage limits, screen status and showActivities. Several eligible posters rotate.

## Verification requirements

Run activity-poster-renderer/schema tests, affected component type checks, translation checks and scoped marketing/TV checks. Check desktop, tablet and phone layouts; loading, empty, filter and error states. Reopen a saved activity and verify all changed settings, actual images, card order and screen preview. Repeat the real workflow after deployment and retain screenshots. API/admin/pos/Android sources are affected; Windows distribution must be considered against its own published baseline.
