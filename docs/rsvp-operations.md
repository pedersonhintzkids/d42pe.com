# RSVP operations

## Current deployment boundary

The existing `main` branch deploys static files to GitHub Pages. That workflow cannot execute the
Worker or persist D1 records. Do not merge or deploy `/rsvp/` with a blank API URL: the attendee
page deliberately fails closed instead of pretending an RSVP was stored.

Production requires explicit authorization to create and operate a Cloudflare Worker and D1
database. No DNS migration is required when the API uses its assigned `workers.dev` HTTPS URL.

## Local verification

Run all credential-free tests:

```sh
npm test
npm run build
```

Start the integrated local preview:

```sh
npm run dev:rsvp
```

Local records are stored in `/tmp/d42pe-rsvp-local.sqlite` by default. Override that location with
`D42PE_RSVP_DEV_DB` when a clean or named test database is needed. Set a local organizer secret in
the shell with `RSVP_ADMIN_SECRET`; never commit it.

Verify these routes:

- `/rsvp/` — attendee funnel.
- `/rsvp/admin/` — organizer shell; data remains protected by the API secret.
- `/healthz` — local storage health only.

## Authorized production setup

Complete these steps only after the Cloudflare account and new provider resources are approved:

1. Authenticate Wrangler using the approved Cloudflare account.
2. Create a D1 database named `d42pe-rsvp`.
3. Copy `worker/wrangler.example.jsonc` to the ignored `worker/wrangler.jsonc` and replace the D1
   database ID. Keep the binding name `DB`. With Wrangler 4.36.0 or newer, replace both rate-limit
   namespace placeholders with different unused positive integers for that Cloudflare account;
   keep the `RSVP_EDGE_RATE_LIMITER` and `RSVP_ACTOR_RATE_LIMITER` binding names unchanged.
4. Create one high-entropy organizer value of at least 32 characters. Store it with Wrangler as
   `RSVP_ADMIN_SECRET`; never put it in a URL, client file, log, issue, commit, or chat message.
5. From `worker/`, apply `migrations/0001_rsvps.sql` to the remote `d42pe-rsvp` database with
   `wrangler d1 migrations apply`.
6. Deploy the Worker. Verify `/healthz` returns `{"ok":true}` without exposing RSVP data.
7. Put the exact deployed HTTPS Worker origin in `rsvp/config.js`. If a custom API hostname is
   used instead of `workers.dev`, also narrow the `connect-src` directives in both RSVP HTML files
   to that exact origin.
8. Rerun the full test suite and browser QA against the production Worker from the local static
   route. Confirm disallowed origins receive no CORS access.
9. Only after that succeeds, merge to `main`, wait for the existing GitHub Pages deployment, and
   verify live attendee creation, refresh restoration, self-confirmation, admin protection, and CSV.

Cloudflare documents [D1 Worker bindings](https://developers.cloudflare.com/d1/worker-api/),
[versioned D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and the
[Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Organizer use

1. Open `/rsvp/admin/` over HTTPS.
2. Enter the environment-only organizer secret. It stays in memory for that tab and is not saved
   to browser storage.
3. Filter by confirmed or started status, search by name, or export the current filter as CSV.
4. Press `LOCK` before handing the device to another person or leaving it unattended.

The list records website state only. `self_confirmed` means the attendee pressed “I SENT THE TEXT.”
It is not carrier delivery, SimpleTexting recognition, consent verification, or proof of a social
follow. “SMS opened” records an attempted native SMS-app handoff; it remains blank for the desktop
copy fallback and is not proof that a message was sent. Click events are outbound clicks only.

## Recovery and rollback

- Static rollback: revert the RSVP merge on `main`; GitHub Pages will redeploy the prior site.
- Worker rollback: use the provider’s deployment version rollback, then recheck `/healthz`.
- Database recovery: use D1 backups/time-travel before any destructive migration or repair.
- Never delete RSVP data or apply a destructive migration without an exported backup and explicit
  approval.
