# October 22 Halloweekend homepage release

Approved homepage design: mobile preview at localhost:4192. This release changes only the root homepage and its isolated flash-sale controller/styles; existing artwork and other routes are preserved.

- Countdown starts the sale at October 22, 2026, 4 PM America/Chicago (21:00 UTC).
- Sale ends at midnight Friday night, October 23: October 24, 2026, 00:00 America/Chicago (05:00 UTC), as updated October 23.
- Before: $9.19 total offer ($8 ticket + $1.19 fees), SMS signup, countdown sharing, early-buyer bonus details.
- During: $9.19 total ticket CTA and remaining sale time. Limited to 100 passes.
- After: $17.59 total ticket CTA ($16 ticket + $1.59 fees). Universe inventory and schedules must be configured separately.
- All paid tickets purchased before the opening cutoff qualify for one free friend pass per paid ticket, covering both nights. Includes earlier purchases, excludes refunded/complimentary tickets. Delivery to the original purchase email is after the sale ends. The website does not issue or email passes.

The October 23 deadline update changes only the website cutoff, deadline copy, and script cache versions. The opening/early-buyer eligibility cutoff remains Thursday, October 22 at 4 PM Austin time. The offer and mobile quick action say until midnight, then the ticket price doubles. Flyer files, flyer downloads/sharing, ticket quantities, and other routes are unchanged.

The server Date header anchors a monotonic clock; synchronization repeats every minute and on resume/online. A five-second timeout preserves the last anchor or falls back to device time on first load. There are no production preview/time overrides.

Original October 22 release verification: complete npm test and build passed, independent code review passed, phone widths 320 and 390 had no horizontal overflow, original assets loaded, bonus/story dialogs worked, and a separate local HTTP Date fixture verified both automatic boundaries without refresh. No purchase or SMS was sent during QA.

October 23 deadline update verification: `npm test`, `npm run build`, and `git diff --check` passed locally. The 47 campaign/drop tests include the old Friday 4 PM cutoff remaining live, the exact midnight boundary in CDT and UTC, the server clock crossing midnight despite an incorrect device clock, and matching clock metadata. These local results do not confirm production publication or Universe scheduling.

Publishing uses GitHub Pages from main at repository root. Pre-release baseline: aa5f670. Roll back by reverting this release commit and pushing the revert to main; that does not roll back Universe changes. Private buyer exports are stored outside the repository and never deployed. Refresh the eligibility roster after the opening cutoff using purchase timestamps strictly before 4 PM, then reconcile refunds before any issuance.
