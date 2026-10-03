# Halloweekend mobile preview — October 3, 2026

final result: passed

## Scope and visual truth

Local design example for review. No production deployment or launch activation.
The selected reference is the recovered July Mansion Party layout, adapted to the approved Halloweekend flyer and the user's requested minimal copy.

- Source: `/Users/dorianhintz/Documents/D42PE.COM BUISNESS/outputs/mansion-mobile-reference-2026-10-02/01-mansion-drop-phone.png`
- Implementation: `/Users/dorianhintz/Documents/D42PE.COM BUISNESS/outputs/halloweekend-mansion-preview-2026-10-03/phone.png`
- Combined visual comparison: `/Users/dorianhintz/Documents/D42PE.COM BUISNESS/outputs/halloweekend-mansion-preview-2026-10-03/comparison.png`
- Full page: `/Users/dorianhintz/Documents/D42PE.COM BUISNESS/outputs/halloweekend-mansion-preview-2026-10-03/phone-full.png`
- Route: `http://127.0.0.1:4183/halloweekend/`

Source and implementation captures are 780 × 1688 pixels, requested viewport 390 × 844, density 2. Both are shown at 390 × 844 in the comparison. The historical page had an effective 405px layout viewport; its overflow is not carried over. Both show the initial landing state. Historical prices and copy are intentionally replaced with confirmed Halloweekend facts, without inventing a price or ticket count.

## Fidelity review

- **Typography:** bold system sans UI follows the Mansion reference. Original red brush wordmark reused as an image. Date, city, ticket CTA, and share/save text are readable without wrapping or cropping at phone widths.
- **Spacing:** single column on phones, consistent 14px control corners, 58px ticket button and 52px share/save buttons. All three actions fit in the first screen at 320, 390, and 430px. Flyer stays straight; tape, annotations, and decorative section transitions removed as proposed.
- **Colors:** dark background, subdued red glow, cream text, red ticket CTA. The blue ACL link remains distinct. Pink is intentionally replaced by flyer red.
- **Assets:** original wordmark and flyer are reused. Library icons are locally served Tabler SVG assets with license. The official PNG and downloaded PNG retain SHA-256 `e23a3ddf78738d47bec9139e4198a1f86ec55de49e2d283dad28d049f911dbdd`.
- **Copy:** only supplied dates, city, costume theme, and hosts appear. Removed slogans remain absent. Ticket/post/profile links that were pending remain pending. No carried-over July price, venue address, time, age limit, capacity, or refund promise.

The comparison at 390 CSS px makes all first-screen labels legible. The full-page screenshot verifies the flyer and lower links; `share-options.png` provides a focused interaction-state view. A focused desktop edge-case check is recorded below.

## Comparison history and findings

1. Initial 320px/390px/1440px visual comparison found no actionable P0/P1/P2 issues. A separate read-only review agreed.
2. **P2 fixed — compact desktop fact cards:** at 900px, the date text had a 135px scroll width in a 125px text box. The fixed 24px desktop type was replaced with `clamp(18px, 2.05vw, 24px)`. Evidence before: `compact-desktop-before.png`; after: `compact-desktop.png`, in the output folder above. The final render and assertions confirm that both fact-card strings fit. Existing phone and wide-desktop typography is unchanged.
3. Final responsive pass has no page or fact-card text overflow at 320, 390, 430, 768, 900, 1024, and 1440px. No remaining P0/P1/P2 findings.

## Verification

- Browser: local Chromium through the Playwright Node API; no in-app Browser control tools were available. Captures were opened and visually inspected.
- Verified pending-ticket dialog; share fallback; clipboard copy; Escape dismissal; original-image viewer; exact PNG download; sticky ticket control after scrolling; preserved ACL route.
- No browser JavaScript errors or failed asset responses in the initial captures. The initially unrequested image in the closed lazy-loaded flyer dialog loads correctly when opened. The verification harness waits for that image before decoding it.
- `npm run test:halloweekend`: 22/22 passed. `npm run build` passed. `git diff --check` passed.
- `launchEnabled` remains false and the real Halloweekend checkout is still pending. This is a reviewed local UI example, not a completed purchase integration.
- Evidence: `render-evidence.json`, `interaction-evidence.json`, and `verification.log` in the output folder above.

## Remaining boundaries

Physical iPhone/Safari native sharing and Instagram/Snapchat posting were not tested in this pass. No external post, send, schedule, purchase, or publish occurred. Design approval and the missing real destination links are still needed before release.

## Rollback

Pre-edit copies of the three Halloweekend source files are in `/Users/dorianhintz/Documents/D42PE.COM BUISNESS/outputs/halloweekend-mansion-preview-2026-10-03/before/`. The ACL homepage, checkout route, launch module, and campaign configuration were not modified by this redesign.

## Approved follow-up — ACL flyer card

The text-only ACL header link is now a blue card showing the existing full ACL flyer, with “ACL After Party” below it. The separate “COSTUME PARTY” line under the Halloweekend wordmark is removed; text inside the official flyer is untouched. The source ACL JPEG was copied without modification from `outputs/acl-address-options-2026-09-29/01-under-event-details.jpg` in the main workspace.

Current captures are in `/Users/dorianhintz/Documents/D42PE.COM BUISNESS/outputs/halloweekend-acl-card-2026-10-03/`: `phone.png` (390px), `small-phone.png` (320px), and `desktop.png` (1440px). Visual inspection confirmed the complete ACL artwork and its caption fit, the main ticket/share/save actions remain within the first phone screen, and there is no horizontal overflow. All captures reported no JavaScript errors or failed asset responses. No deployment or launch activation was performed.

## Follow-up — ACL pointer and delayed scroll hint

Added the blue “PRESS FOR ACL AFTER PARTY” label and curved arrow beside the ACL flyer. The label belongs to the same link as the flyer. Existing card dimensions, Halloweekend content, and ticket/share/save positions are unchanged.

A small “SCROLL FOR MORE” button appears after three seconds of inactivity at the top. Its chevron moves twice, with animation disabled for reduced-motion preferences. It never moves the page automatically or changes the content layout. Tapping it scrolls to the flyer and moves keyboard focus to that section heading. It dismisses after scrolling, other interaction, leaving the tab, or eight seconds on screen, and does not reappear during that page visit.

Evidence: `/Users/dorianhintz/Documents/D42PE.COM BUISNESS/outputs/halloweekend-navigation-cues-2026-10-03/`. Visually checked `phone.png`, `small-phone.png`, and `desktop.png`. `verification.json` records six passing browser cases: phone, small phone, desktop, reduced motion, already-scrolled visitor, and ticket-dialog interaction. Confirmed no horizontal overflow or header overlap, no automatic scrolling/layout shift, ACL callout navigation, tap-to-scroll, dismissal, expiration, no JavaScript errors, and no failed asset responses. `npm run build` and `git diff --check` passed. The three pre-edit source files are retained in `before/` in that evidence folder. The site remains a local preview, with launch disabled.

## Follow-up — supplied ticket and social links

On October 3 the user supplied the Universe Halloweeknd link (`7T6MWX`, preserving `ref=Website`), Instagram `512__events`, and Snapchat `@atxpartys`. All three are connected in configuration, JavaScript defaults, and HTML. Both ticket controls use the supplied Universe URL, and the two profile controls are now enabled. No layout or creative changes were made. The announcement-post URL is still pending; `launchEnabled` remains false.

Browser checks passed with normal configuration, a failed configuration request, and JavaScript disabled: both ticket hrefs match, profile controls are enabled with exact supplied destinations, and tapping the primary ticket button requests the correct Universe URL. Ticket navigation was intercepted in the browser to verify the outbound URL, not a transaction. External web-tool checks were unavailable/throttled, so remote page availability and checkout completion were not verified. All 22 launch tests, the build, and diff whitespace checks passed. Nothing was deployed or scheduled.

## Authorized launch release — October 3 afternoon

The user approved the 9 PM Austin-time website handoff and the ticket changes. The release is now armed in both the JSON configuration and its validated bundled fallback. Earlier sections above describe the design-preview stage, not the current release setting. Deployment evidence is recorded separately from the future launch.

The approved artwork and layout are preserved. Both ticket buttons use Universe's native direct-checkout trigger and preserve incoming affiliate/campaign attribution. The Instagram control is a visible clickable button using the D42PE profile until the real post URL is supplied. Location is shown as Austin, Texas, with no venue/address. Launch refreshes use unique configuration URLs, server-time anchoring, timeout handling, session rollback preservation, and visibility/deadline checks.

The complete local test suite and production build passed. All 34 launch tests passed, including outage, malformed-response, wrong-device-clock, exact-boundary, and rollback cases. A read-only final review found and corrected one release-test assertion that would have wrongly rejected a future valid Instagram post URL.

Browser smoke checks at 320×568, 375×667, 390×844, and 1440×900 confirmed the main ticket CTA fits on the initial screen, no horizontal overflow or JavaScript errors, mobile sticky tickets after scrolling, Instagram profile fallback, flyer zoom, and ticket URLs retaining both Universe's checkout trigger and affiliate tracking. Evidence is under `outputs/halloweekend-launch-2026-10-03/evidence/` in the parent workspace. The phone captures were visually inspected. Physical-device social posting and completed purchases are not part of these checks.
