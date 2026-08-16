# d42pe.com

Static website for D42PE events and updates.

## Alpha MVP route

`/next-up/` is an isolated, no-index concept test for D42PE Next Up. It does not change the
homepage or existing routes. Responses are prepared as texts to the existing D42PE number, so
the GitHub Pages site does not collect or store personal information.

Render the 1080×1920 story asset:

```sh
node tools/render-next-up-story.cjs
```

Verify the isolated MVP files:

```sh
node tests/verify-next-up.cjs
```

For a manual preview, run `python3 -m http.server 4173` and open `/next-up/`.
