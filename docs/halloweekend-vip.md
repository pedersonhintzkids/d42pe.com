# Halloweekend VIP sharing guide

Approved on October 3, 2026: create `/vip/`, invite buyers through Universe's Additional order message, and use the existing official flyer. The offer is a chance to win **four VIP passes for both October 30 and October 31**, with **multiple winning groups**. The user requested no perk list, closing-time copy, or countdown. No number of winning groups or fixed drawing date has been authorized; neither is invented on the page.

## Buyer and sharing flow

Confirmation → `https://d42pe.com/vip/` → save flyer + copy ticket link → post an Instagram or Snapchat Story → manually attach the Story screenshot and username in Messages → the D42PE team verifies and confirms the entry.

The copied link goes to `/halloweekend/`, never the giveaway page, with `ref=VIPStory`, `utm_source=attendee`, `utm_medium=story`, and `utm_campaign=halloweekend_2026`. The existing ticket handoff preserves those parameters to Universe. This is aggregate Story attribution, not proof of an individual referral or an analytics integration.

The downloaded PNG remains the exact official flyer. Participants add the visible text **D42PE giveaway entry** to their Story to identify the incentive. Website copy actions provide manual selection if clipboard access is unavailable. The SMS button opens the existing number `+15126107851`; it cannot attach screenshots, send messages, validate entries, or confirm receipt.

An equal-chance free entry without posting is available in Entry details using the same SMS inbox and the explicit text **HALLOWEEKEND VIP — Free entry**. No marketing opt-in or new subscription is performed by this site.

## Confirmation invitation

Preserve the existing confirmation text and append:

```text
WIN VIP FOR YOU + 3 FRIENDS — BOTH NIGHTS
Multiple winning groups.

Post the flyer + D42PE.COM link on your Instagram or Snapchat Story, then text your screenshot + username to (512) 610-7851.

Get the flyer + enter: https://d42pe.com/vip/
No purchase necessary. Entry details + free entry at the link.
```

This belongs only in Halloweekend event `7T6MWX` → Event Information → Additional Details → Additional order message. It must not replace accessibility information, change ticket settings, send a broadcast, or change ACL.

## Manual operator work

1. Monitor the existing SimpleTexting inbox for both entry formats. The site does not create keyword automations or an entry database.
2. For Story entries, check the posted flyer, link, visible giveaway disclosure, and username. Do not request ticket barcodes. Count eligible free entries equally.
3. Record one entry per person and confirm after checking. Merely opening Messages or copying a link is not an entry.
4. The user controls drawing frequency, number of groups, and prize fulfillment. Do not claim entries have been verified, winners selected, prizes issued, or winner messages sent from website tests.
5. Keep the public offer accurate as awards occur and the event begins. A two-night pass should be awarded in time to use both nights. There is no automatic drawing or expiry in this release.

## Verification and rollback

Run `npm test`, `npm run build`, and mobile browser checks. Verify clipboard denial, tracked link propagation, iPhone/Android SMS formats, downloadable original image, no horizontal overflow, accessible disclosures, and unchanged homepage launch behavior. Native phone Messages, screenshots, Story posting, entry receipt, and real confirmation-email delivery require separate device/provider verification.

Rollback: remove the two `/vip/` invitation links from the Halloweekend HTML and the appended paragraph from the Universe Additional order message. The new `/vip/` assets are isolated; do not change `campaign-launch.js`, `campaign-config.json`, tickets, or event settings.
