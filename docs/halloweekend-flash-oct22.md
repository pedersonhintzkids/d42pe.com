# October 22 Halloweekend homepage release

Approved homepage design: mobile preview at localhost:4192. This release changes only the root homepage and its isolated flash-sale controller/styles; existing artwork and other routes are preserved.

- Countdown starts the sale at October 22, 2026, 4 PM America/Chicago (21:00 UTC).
- Sale ends October 23, 2026, 4 PM America/Chicago (21:00 UTC).
- Before: $8 offer, SMS signup, countdown sharing, early-buyer bonus details.
- During: $8 ticket CTA and remaining sale time. Limited to 100 passes; fees additional.
- After: $16 ticket CTA. Universe inventory and schedules must be configured separately.
- All paid tickets purchased before the opening cutoff qualify for one free friend pass per paid ticket, covering both nights. Includes earlier purchases, excludes refunded/complimentary tickets. Delivery to the original purchase email is after the sale ends. The website does not issue or email passes.

The server Date header anchors a monotonic clock; synchronization repeats every minute and on resume/online. A five-second timeout preserves the last anchor or falls back to device time on first load. There are no production preview/time overrides.

Verification: complete npm test and build passed, independent code review passed, phone widths 320 and 390 had no horizontal overflow, original assets loaded, bonus/story dialogs worked, and a separate local HTTP Date fixture verified both automatic boundaries without refresh. No purchase or SMS was sent during QA.

Publishing uses GitHub Pages from main at repository root. Pre-release baseline: aa5f670. Roll back by reverting this release commit and pushing the revert to main; that does not roll back Universe changes. Private buyer exports are stored outside the repository and never deployed. Refresh the eligibility roster after the opening cutoff using purchase timestamps strictly before 4 PM, then reconcile refunds before any issuance.
