# October 15 Halloweekend homepage drop

Authorized by Dorian for immediate public deployment. Only the root homepage is changed. The event is October 30 + 31 in Austin, Texas; no venue address is advertised.

## Release behavior

- Before **October 15, 2026, 4:00 PM America/Chicago** (CDT, UTC−05:00): Halloweekend wordmark, countdown, share/copy website, text signup and four social profiles.
- At **2026-10-15T21:00:00Z**: same open page reveals ticket actions, official flyer, original download and phone sharing. No reload or operator session is required. A resumed tab refreshes its clock.
- Root-only runtime: `halloweekend/drop.js`, pure settings/helpers: `drop-core.js`, layout overrides: `drop.css`.
- `drop-clock.json` is a small same-origin time probe. Launch configuration is the versioned `DROP` export, not the JSON response body.
- GitHub Pages Date is refreshed by the CDN even when Age is nonzero. Use **Date alone**, anchored to `performance.now()`; adding Age would release early. A fresh phone waits for the first time probe (bounded at five seconds). If the probe fails, it falls back to the device clock until server time is available. Existing trusted time survives network failure.
- No production query parameter can bypass the countdown. Tests simulate server time using browser network interception.
- Native file sharing depends on the browser/installed apps. Downloads, link copying, full-size image and manual copy remain available. The site does not automatically publish any story or send any message.

## Confirmed assets and destinations

Dorian reconfirmed these on October 15:

- Ticket event: `https://www.universe.com/events/halloweeknd-tickets-7T6MWX?ref=Website&unii-trigger-open=7T6MWX`.
- Original: `assets/halloweekend/official-flyer.png`, 1122 × 1402 PNG.
- SHA256: `e23a3ddf78738d47bec9139e4198a1f86ec55de49e2d283dad28d049f911dbdd`.
- Flyer remains unchanged, including 512 Events + Ritual X with the red X.
- Shared website URL is `https://d42pe.com/`.
- Text composer: +1 512 610 7851, keyword D42PE.
- Existing Instagram and Snapchat profile destinations retained.

The Universe ticket picker was independently verified anonymously on October 15 and is already public. This release schedules the **homepage reveal**, not Universe inventory/sales availability.

## Scope and rollback

The `/halloweekend/`, `/acl/`, `/tickets/`, `/vip/` pages and shared `campaign-config.json` retain their previous paused state. This release does not restart the old October 3 campaign redirect runtime or change ticket settings.

Baseline main commit: `aef7d4d`. To undo only this release after approval, revert its deployment commit and republish GitHub Pages; do not reset unrelated later commits. For future timing changes, update the versioned DROP configuration and displayed date, bump asset versions and rerun boundary/browser tests.

## Verification

- `npm test` and `npm run build`.
- Unit coverage: exact CDT/UTC boundary, late arrival, wrong phone clock, CDN Age, attribution and iOS/Android SMS.
- Browser coverage: Chromium and WebKit, small phone and desktop widths, countdown/live layout, same-tab transition, sharing/copy fallback, original download, sticky CTA and no horizontal overflow.
- Verify the deployed homepage and new assets over HTTPS after Pages reports the deployment built. Keep native share-sheet selection and actual posting manual; automated tests use share stubs.
