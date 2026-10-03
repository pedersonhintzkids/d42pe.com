# Halloweekend homepage handoff

## Approved release

Dorian authorized deployment and the timed handoff on October 3, 2026. The release is armed for **October 3 at 9:00 PM Austin time (CDT)**: `2026-10-03T21:00:00-05:00`, or `2026-10-04T02:00:00Z`. Both `campaign-config.json` and the bundled fallback in `campaign-launch.js` contain that timestamp and `launchEnabled: true`. No operator computer or Codex session needs to remain running.

This document describes the release configuration. Confirm production deployment and the actual handoff separately; tests and an armed file alone are not evidence that the future launch has occurred.

## Routes and checkout

| Route | Before launch / disarmed | After enabled launch |
| --- | --- | --- |
| `/` and `/index.html` | Existing ACL homepage | Redirects to `/halloweekend/` |
| `/halloweekend/` | Local preview accessible; public visits redirect to `/` when server time is available | Halloweekend page |
| `/acl/` and `/tickets/`, including nested paths | ACL | ACL |
| Other routes | Unchanged | Unchanged |

The blue ACL flyer remains a separate route from the Halloweekend page. The official Halloweekend flyer is unchanged. The landing page shows only **Austin, Texas**; it does not advertise a venue or street address.

Both GET TICKETS buttons use Universe's custom direct-checkout link:

`https://www.universe.com/events/halloweeknd-tickets-7T6MWX?ref=Website&unii-trigger-open=7T6MWX`

The first ticket button is visible on the first phone screen. A sticky ticket button becomes available when the main button leaves the viewport. Incoming `ref`, `src`, `utm_*`, `fbclid`, `igshid`, and `sc_click_id` attribution carries through the handoff and ticket/share links. Without incoming attribution, checkout retains `ref=Website`.

## Instagram post update

`instagramPostUrl` is currently `null`. The visible Instagram button is clickable and opens `https://www.instagram.com/d42pe.events_atx/`. Once the exact flyer post is live:

1. Set `instagramPostUrl` in `campaign-config.json` to the supplied HTTPS post URL.
2. Run `npm run test:halloweekend` and deploy the JSON change.
3. Confirm the public configuration and button destination. The label becomes **View flyer on Instagram**, and **Copy Instagram post link** becomes available.

Existing open pages refresh configuration roughly every minute and on visibility/pageshow. Do not infer that posting to Instagram occurred from the website update. The other connected profiles are `512__events`, `@atxpartys`, `d42pe.events_atx`, and `d42pe.atx`; SMS opens a message to the existing D42PE number with keyword D42PE.

## Timing and failure handling

HTML references versioned JS/CSS (`20261003-1`). JSON requests have a unique query string plus no-store/no-cache settings to avoid stale shared-cache settings. The runtime validates configuration before using it and retains the last valid response on malformed or failed refreshes.

The browser anchors time to HTTP `Date`, plus `Age` when present, and estimates transit time at half the request duration, capped at two seconds. It advances the observation using `performance.now()` so a phone clock change does not alter an observed deadline. Open pages evaluate at the deadline, refresh every minute, and refresh when resumed. Requests time out after eight seconds.

If the first JSON request fails, the bundled approved release keeps the handoff available. A validated server or session configuration, including an explicit disabled release, takes priority over this fallback. Public routing settings are retained in session storage to prevent a failed destination fetch from undoing a completed handoff.

Limitations: this is a client-side handoff on GitHub Pages. JavaScript-disabled visitors and root-page crawlers still receive ACL HTML. Background browsers can suspend timers and update on resume. If all server-time requests fail before any time observation, root routing falls back to the device clock; direct Halloweekend visits stay available without trusted time to avoid a redirect loop. This is a launch convenience, not access control or a guarantee of millisecond timing on every device.

## Rollback

To cancel or postpone the handoff, change the setting in **both** `campaign-config.json` and `RELEASE_CAMPAIGN_CONFIG` in `campaign-launch.js`, bump the script version in root/Halloweekend HTML and the Halloweekend JS import, adjust the release assertions, then test and deploy together. A successfully fetched `launchEnabled: false` overrides an older bundled release immediately; updating both sources also covers new sessions during a configuration outage. Keep `/acl/` and `/tickets/` intact. Site rollback does not cancel ticket sales or the event.

## Universe pass configuration

The authorized offer is **one $8 ticket per person, valid on both October 30 and October 31**, limited to 100 passes in total. The existing $16 tier contains 200 passes. To make the same ticket valid across both nights, the two independent date slots were replaced with one 31-hour admission window beginning October 30 at 6 PM and ending November 1 at 1 AM, covering the existing nightly hours. This window is not a claim of a continuous 31-hour party.

Both ticket types are named as two-night passes, with descriptions explaining the same QR code and one admission each night. They use two maximum redemptions and a 12-hour delay between scans. Event staff must use online BoxOffice scanning and the correct event to enforce the delay. A real ticket scan on both nights has not been tested.

The first 100 passes are active. The $16 tier is hidden, ready for manual release after the first 100 sell. Native automatic tier releases require a different regular-event setup and Universe's higher-fee Standard plan; no upgrade or rebuild is authorized yet. To release manually, first verify the $8 tier has sold its 100 passes, then make the $16 tier Active and save. Never reset the first tier's inventory or represent the whole venue as sold out based on this promotional allocation.

## Validation and preview

Use `D42PE_RSVP_PORT=4183 npm run dev:rsvp`, then open `http://127.0.0.1:4183/halloweekend/`.

Run `npm test`, `npm run build`, and `git diff --check`. Launch tests cover the exact CDT/UTC boundary, incorrect phone clocks, cache bypass, offline and malformed configuration, rollback, route protection, attribution, open-page deadlines, and resumed tabs. Browser checks cover 320/375/390/1440-pixel viewports, visible first-screen tickets, sticky mobile tickets, Instagram fallback, flyer zoom, and no horizontal overflow. Production smoke tests must also verify root remains ACL before the deadline and assets/config are available.

Native phone share-sheet behavior, Instagram/Snapchat posting, a completed purchase, and physical two-night scanning are separate from browser/configuration checks and must not be reported as tested merely because links work. No social or SMS messages are sent by this release.
