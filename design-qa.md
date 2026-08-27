# RSVP design QA

## Sources and evidence

- Source attachment: `/Users/dorianhintz/.codex/attachments/08e603d2-23c6-4c5c-b7fb-69a93421edb4/image-1.png`
- Repository asset: `assets/rsvp/ritual-x-2016-house-party-flyer-2026-08-29.png`
- Source and repository asset: 1138 × 1382 RGB PNG, 2,830,181 bytes, SHA-256 `e10f75de0e26bf7d489d9ea4dbf1ee447605b7b9160672b041b30a722f8381b8`
- Responsive delivery assets: lossless VP8L WebP at 720 × 874 (945,622 bytes) and 1138 × 1382 (2,113,918 bytes), with the exact PNG retained as the fallback and social-preview source
- Same-input visual comparison: `artifacts/rsvp/flyer-comparison.png`
- Full-view captures: `artifacts/rsvp/step-1-390x844-viewport.png`, `artifacts/rsvp/step-1-430x932.png`, `artifacts/rsvp/step-1-430x932-webp.jpg`, `artifacts/rsvp/step-1-desktop.png`, `artifacts/rsvp/step-2-390x844.png`, `artifacts/rsvp/step-3-390x844.png`, and `artifacts/rsvp/admin-desktop.png`

## Viewport and density checks

- Requested 390 × 844: browser-reported viewport 390 × 844; non-overlay test scrollbar left a 375px layout viewport. The flyer rendered at 335 × 406.82 with 20px gutters, retained its 569:691 ratio, selected the 720w lossless WebP, loaded without an error, and caused no horizontal overflow.
- Requested 430 × 932: browser-reported viewport 430 × 932; non-overlay test scrollbar left a 415px layout viewport. The flyer rendered at 375 × 455.40 with 20px gutters, retained its ratio, selected the 720w lossless WebP, loaded without an error, and caused no horizontal overflow.
- Requested 1440 × 1000: the flyer rendered centered at 569 × 691 and selected the 1138 × 1382 lossless WebP. No horizontal overflow or broken image was present.
- Visible Step 1 controls at mobile size were at least 44px tall; the name input and primary action were 56px tall. Focus indicators were visibly rendered at 3px with a 4px offset.

## Comparison history

1. Checked the source attachment and implementation crop side by side at the same 350 × 425 display size.
2. Confirmed identical composition, edge content, aspect ratio, text visibility, and color treatment. No crop, rounding, overlay, or redesign was introduced.
3. Checked all three attendee states and the organizer view at the required responsive sizes. Heading hierarchy, official-host treatment, prepared SMS fallback, action order, confirmation/social hierarchy, and table layout matched the D42PE system and the supplied requirements.
4. Verified empty-name error, server-offline retry state, copy feedback, refresh restoration, edit-name reuse, confirmation restoration, exact outbound destinations, protected organizer login, filtering, pagination, and export feedback in the rendered UI.
5. Rechecked the responsive `<picture>` delivery after optimization. Pixel comparison confirmed the full-size WebP is identical to the PNG decode and the 720w WebP is identical to its reference resize; runtime inspection confirmed the intended candidate at mobile and desktop sizes.

## Severity review

- P0 blockers: none.
- P1 major mismatches: none.
- P2 visible polish or accessibility issues: none after correcting the Step 1 ARIA label target and tracking the confirmation handle.
- P3 observation: browser screenshot resampling is slightly softer than the original raster at mobile display size; the shipped PNG remains byte-identical to the attachment and the served WebP candidates are lossless.

final result: passed
