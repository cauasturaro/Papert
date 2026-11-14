# Web client internals

How the Web app proxies to Core, saves the workspace, ships editor assets and sets its
security headers. Setup and commands are in the [Web README](../apps/web/README.md).

## The browser only talks to this app

Route handlers under `app/api/*` are a small backend-for-frontend in front of Core. The
session lives in an `HttpOnly` cookie that Core sets and the proxy passes through, so no
token ever reaches client code. Files are the one exception to "same origin only": they go
straight to storage with presigned URLs.

The proxy is an allowlist, not a pass-through. Each area (`auth`, `study`, `executions`,
`community`, `memory`, `feedback`, `engagement`) declares its routes in
[`app/api/routes.ts`](../apps/web/app/api/routes.ts): a whole-path pattern built from UUID and slug
fragments, the allowed methods, and the query parameters to forward. For every request,
[`route-table.ts`](../apps/web/app/api/route-table.ts) does the following:

- answers `404` for paths that are not listed, and `405` with an `Allow` header for listed
  paths called with another method;
- forwards only the listed query parameters and silently drops the rest;
- forwards only the `cookie`, `origin` and `content-type` request headers, and only
  `content-type`, `retry-after` and each `set-cookie` back.

Core therefore never sees a request shape the web app did not expect. Adding a Core endpoint
means adding a route here, and `routes.test.mjs` pins what each table allows.

Next keeps a client-written `X-Forwarded-For` and gives route handlers no socket address, so
the web app cannot learn the client's address on its own. In Compose an nginx ingress
overwrites that header with the real peer, and `TRUSTED_PROXY_COUNT=1` tells the proxy to
trust exactly that entry. The proxy then forwards one address to Core together with the shared
`EDGE_PROXY_SECRET`; Core trusts the forwarded address only when the secret matches and
otherwise uses its own peer. With `TRUSTED_PROXY_COUNT=0` or no secret, no address is
forwarded, which is safe but puts every learner in one rate-limit bucket.

## Autosave

The workspace editor saves on its own, about 0.7 s after typing stops, and is built to never
lose work silently. The logic lives in
[`use-workspace-session.ts`](../apps/web/app/study/workspace/use-workspace-session.ts), with the pure
parts (`save-state.ts`, `save-failure.ts`, `workspace-recovery.ts`, `tab-presence.ts`)
covered by unit tests.

- **Revisions.** Every save sends the revision it was based on. Core rejects a save made
  from an older revision with `409`, so two editors cannot overwrite each other's work
  without noticing. A successful save returns only the new revision, and typing during the
  request stays in the draft for the next save.
- **Conflicts.** A `409` stops autosave and shows an explicit choice. The learner can load
  the saved version or keep their own; keeping it re-reads the latest revision and saves
  the draft on top of it.
- **Failures.** Network errors, 5xx and rate limits retry with exponential backoff (2 s up
  to a minute, or the server's `Retry-After`). Validation errors stop and explain. Going
  offline or losing the session pauses autosave, which resumes on reconnect or sign-in.
  Going offline, failing, recovering and conflicts are announced to screen readers.
- **Cross-tab.** Tabs showing the same workspace find each other over a
  `BroadcastChannel`. The editor warns when the workspace is open elsewhere, and a tab with
  no unsaved edits quietly follows another tab's save. A tab with edits meets the conflict
  on its next save instead of being overwritten.
- **Offline copy.** Unsaved changes are copied to `localStorage` (debounced, and flushed
  when the tab is hidden or closed). After a reload, a crash or an expired session, the copy
  is offered back. It is treated as a conflict if the server moved on in the meantime. When
  storage is unavailable, the editor says so and offers a JSON download of the files.

## Editor assets and type packs

Monaco is self-hosted rather than loaded from a CDN, so scripts and workers can stay
same-origin under the Content Security Policy. Three `prebuild`/`predev` scripts prepare the
static assets:

- [`prepare-monaco.mjs`](../apps/web/scripts/prepare-monaco.mjs) bundles the editor and its workers with
  esbuild. It asserts that Monaco's vendored DOMPurify is replaced by the patched
  dependency.
- [`prepare-type-packs.mjs`](../apps/web/scripts/prepare-type-packs.mjs) builds TypeScript declaration
  packs for common libraries (React, Next, Node, Express, NestJS, Zod, Drizzle, TypeORM,
  Mongoose, LLM SDKs and others). Their versions are pinned in
  [`type-packs/package.json`](../apps/web/type-packs/package.json). For each pack, the TypeScript
  compiler resolves the real declaration graph. That resolution is sandboxed to the pinned
  installation and fails the build if a type escapes it. Packages shared by several packs
  move into shared packs, and large packs are split under a size budget.
- [`prepare-pdf.mjs`](../apps/web/scripts/prepare-pdf.mjs) copies the PDF.js worker of the exact
  `pdfjs-dist` version that is bundled.

Every Monaco script and type pack gets a content-hashed file name, and a small
`manifest.json` maps stable ids to those names. The hashed files are served with
`Cache-Control: immutable` for a year; the manifests are always revalidated. A deploy
therefore never mixes old and new assets, and returning learners download nothing that has
not changed.

In the browser, the editor reads the imports and `package.json` dependencies of the
workspace's files, resolves the packs they trigger along with their dependencies, and
registers only those with the TypeScript worker. A workspace that never imports React never
downloads React's types. Diagnostics for packages without a pack are suppressed instead of
being shown as false errors.

## Security headers

[`lib/security/headers.ts`](../apps/web/lib/security/headers.ts) sets the headers through Next's
`headers()` config, so they apply to every response, including prerendered pages:

- a Content Security Policy with `default-src 'self'`, `object-src 'none'`,
  `base-uri 'none'`, `form-action 'self'` and `frame-ancestors 'none'`;
- `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, a `Permissions-Policy`
  that turns off camera, microphone, geolocation, payment and USB, and HSTS outside
  development.

The policy makes one deliberate trade-off: `script-src` allows `'unsafe-inline'`. Next's
inline bootstrap scripts and the theme script need either that or a per-request nonce. A
nonce would force every page to render per request and give up static prerendering, so
this app keeps prerendering and accepts the weaker script policy. The remaining exceptions
are narrow: `'wasm-unsafe-eval'` lets PDF.js compile WebAssembly, `style-src` allows inline
styles because Monaco injects them, and workers are same-origin or `blob:`. `'unsafe-eval'`
is added in development only.

`connect-src` lists the app itself plus `CSP_CONNECT_SRC`, a space-separated list of upload
storage and WebSocket origins. Next records headers at build time, so this value is a build
argument of the Docker image, not a runtime variable.
