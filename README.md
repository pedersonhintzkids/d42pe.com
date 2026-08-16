# d42pe.com

Static website for D42PE events and updates.

## Alpha MVP route

`/next-up/` is an isolated, no-index artist-intake concept test for D42PE Next Up. It is intended
to be sent directly to emerging artists and DJs, not posted as a public ticket-interest survey.
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
