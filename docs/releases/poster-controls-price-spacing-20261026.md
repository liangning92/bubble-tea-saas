# Poster controls and price row spacing — 2026-10-26

The reference/free positioning renderer previously ignored several controls retained in the original design tabs. Price rows also used independent percentage boxes with no control for spacing between them, and text effects could be clipped by those short boxes.

- Connect existing typography, theme, card/image layout, shadow, gradient, border, padding, price style and today-highlight controls to the shared renderer. Global edits apply the changed property to every card while retaining unrelated individual customizations.
- Add separate normal-to-offer and offer-to-savings gaps, measured in canvas pixels. Reflow the three text boxes with enough height for their font and outline, move the block upward when needed to remain above the weekday footer, and resize its background.
- Add italic, underline, strikethrough, case conversion, text glow/outline and clear-effects controls; persist the style schema. Text shadow no longer draws a rectangular box shadow and text is not clipped by the old price-box height.
- Preserve activity rules, status, all original editor tabs, images, card operations, playback eligibility and marketing navigation. The test activity remains paused. Physical TV acceptance is excluded at the user's request.

Verification uses the approved isolated copy of one activity, five products and their images, with a fresh synthetic account and automatic batch cleanup. Check save/reopen of 8px/10px price gaps and text effects; confirm previously inert controls change preview output; check desktop/tablet/phone layouts. The canonical renderer is bundled identically into the web TV and Android assets. Exact CI and component build/publication/deployment records and screenshots are retained in output/poster-controls-20261026.
