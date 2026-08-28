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

Both commands run the configuration gate. With only the committed example present, it verifies
that the template contains no provider IDs or secrets. If the ignored `worker/wrangler.jsonc`
exists, the same gate automatically switches to production mode and rejects placeholders,
invalid or reused rate-limit namespaces, a missing API origin, a mismatched CSP, and plaintext
secret-bearing configuration.

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

1. Use Wrangler 4.36.0 or newer and authenticate it with the approved Cloudflare account.
2. Create a D1 database named `d42pe-rsvp`.
3. Copy `worker/wrangler.example.jsonc` to the ignored `worker/wrangler.jsonc` and replace the D1
   database UUID. Keep the binding name `DB`. Replace both rate-limit namespace placeholders with
   different unused positive-integer strings for that Cloudflare account; keep the
   `RSVP_EDGE_RATE_LIMITER` and `RSVP_ACTOR_RATE_LIMITER` binding names unchanged.
4. Obtain the exact HTTPS origin the Worker name and approved account subdomain will use (or the
   approved custom API origin). Put that origin in `rsvp/config.js`, then replace the wildcard in
   both RSVP HTML `connect-src` directives with that same exact origin. Production must never ship
   the broad `https://*.workers.dev` source.
5. Run the credential-free production release gate from the repository root. It must report
   `"ok": true` before any Worker deployment:

   ```sh
   npm run validate:rsvp-production
   ```

6. From `worker/`, apply the committed migration to the named remote database. The database name
   and `--remote` flag are both required so the release cannot silently target local state or the
   wrong binding:

   ```sh
   npx wrangler d1 migrations apply d42pe-rsvp --remote
   ```

7. Create one high-entropy organizer value of at least 32 characters. A brand-new Worker does not
   exist yet, so `wrangler secret put` cannot initialize its first secret. Instead, create the
   ignored `worker/.env.production` with owner-only permissions, add only
   `RSVP_ADMIN_SECRET=<APPROVED_HIGH_ENTROPY_VALUE>`, verify Git ignores the file, and upload the
   secret atomically with the first deployment:

   ```sh
   cd worker
   umask 077
   touch .env.production
   git check-ignore --quiet .env.production
   npx wrangler deploy --secrets-file .env.production
   ```

   Never put the value in a URL, client file, Wrangler config, shell command, log, issue, commit,
   or chat message. Delete `.env.production` immediately after the successful deployment. The
   Wrangler config declares the required secret name only; it never contains the value. For later
   rotations, after the Worker exists, use `npx wrangler secret put RSVP_ADMIN_SECRET`.

8. Verify `/healthz` returns `{"ok":true}` without exposing RSVP data.
9. Rerun the full local suite and browser QA against the local adapter. Separately smoke-test the
   deployed Worker: verify `/healthz`, send direct API requests with `Origin: https://d42pe.com`,
   and confirm a disallowed origin receives no CORS access. The exact production CORS policy
   intentionally prevents a page on `127.0.0.1` from calling the deployed Worker.
10. Only after those checks succeed, merge to `main`, wait for the existing GitHub Pages
   deployment, and run the complete browser flow on live `https://d42pe.com/rsvp/`: attendee
   creation, refresh restoration, edit/reopen, self-confirmation, social links, admin protection,
   and CSV. Roll back the static release if that live end-to-end check fails.

Cloudflare documents [D1 Worker bindings](https://developers.cloudflare.com/d1/worker-api/),
[versioned D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), and the
[Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
Its [Workers secrets guide](https://developers.cloudflare.com/workers/configuration/secrets/)
documents uploading first-deploy secrets with `--secrets-file`.

## Organizer use

1. Open `/rsvp/admin/` over HTTPS.
2. Enter the environment-only organizer secret. It stays in memory for that tab and is not saved
   to browser storage.
3. Filter by confirmed or started status, search by name, or export the current filter as CSV.
4. Press `LOCK` before handing the device to another person or leaving it unattended.

The list records website state only. `self_confirmed` means the attendee pressed “I SENT THE TEXT.”
It is not carrier delivery, SimpleTexting recognition, consent verification, or proof of a social
follow. “SMS opened” records an attempted SMS-app handoff from the website on mobile or desktop;
it is not proof that a message was sent. Opening the collapsed copy fallback does not create a new
handoff attempt. Click events are outbound clicks only.

## Recovery and rollback

- Static rollback: revert the RSVP merge on `main`; GitHub Pages will redeploy the prior site.
- Worker rollback: use the provider’s deployment version rollback, then recheck `/healthz`.
- Database recovery: use D1 backups/time-travel before any destructive migration or repair.
- Never delete RSVP data or apply a destructive migration without an exported backup and explicit
  approval.
