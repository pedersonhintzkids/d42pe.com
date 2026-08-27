# d42pe.com

Static website for D42PE events and updates.

## Ritual X RSVP route

`/rsvp/` is a three-step attendee flow for the August 29, 2026 RITUAL X event:

1. Save a name and open the exact prepared SMS.
2. Return and self-confirm that the text was sent.
3. See the confirmation and official social links.

The browser route stays on GitHub Pages. Durable records, token-protected attendee updates,
rate limiting, organizer queries, click events, and CSV export are implemented in the isolated
Cloudflare Worker under `worker/`. GitHub Pages cannot run that server code, so the public route
must not be deployed until a Worker, D1 database, and environment-only organizer secret are live
and the deployed Worker URL has replaced the blank value in `rsvp/config.js`.

Run the credential-free local implementation:

```sh
npm run dev:rsvp
```

Then open `/rsvp/`. The local server uses a SQLite-backed D1 adapter and keeps preview data outside
the repository. Run the focused checks with:

```sh
npm test
npm run build
```

Production provisioning, migration, verification, rollback, and organizer instructions are in
[`docs/rsvp-operations.md`](docs/rsvp-operations.md).

## Alpha MVP route

`/next-up/` is a no-index artist-intake concept test for D42PE Next Up. It is linked from the
homepage as a fallback for artists who type d42pe.com directly and can also be sent to emerging
artists and DJs. It is not a public ticket-interest survey.
Applicants share their identity, strongest clip, expected draw, availability, booking terms and
promotion commitment. Responses are prepared as texts to the existing D42PE number, so the
GitHub Pages site does not collect or store application data.

Render the 1080×1920 artist-intake share asset:

```sh
node tools/render-next-up-story.cjs
```

Verify the isolated MVP files:

```sh
node tests/verify-next-up.cjs
```

For a manual preview, run `python3 -m http.server 4173` and open `/next-up/`.
